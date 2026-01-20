import fs from "fs-extra";
import { got } from "get-or-throw";
import assert from "node:assert";
import path from "node:path";
import { unique } from "remeda";
import type { IsolateConfig } from "./lib/config";
import { resolveConfig } from "./lib/config";
import { processLockfile } from "./lib/lockfile";
import { setLogLevel, useLogger } from "./lib/logger";
import {
  adaptInternalPackageManifests,
  adaptTargetPackageManifest,
  readManifest,
  validateManifestMandatoryFields,
  writeManifest,
} from "./lib/manifest";
import {
  getBuildOutputDir,
  packDependencies,
  processBuildOutputFiles,
  unpackDependencies,
} from "./lib/output";
import { detectPackageManager, shouldUsePnpmPack } from "./lib/package-manager";
import { getVersion } from "./lib/package-manager/helpers/infer-from-files";
import { copyPatches } from "./lib/patches/copy-patches";
import { createPackagesRegistry, listInternalPackages } from "./lib/registry";
import type { PackageManifest } from "./lib/types";
import {
  getDirname,
  getRootRelativeLogPath,
  isRushWorkspace,
  readTypedJson,
  writeTypedYamlSync,
} from "./lib/utils";

const __dirname = getDirname(import.meta.url);

export function createIsolator(config?: IsolateConfig) {
  const resolvedConfig = resolveConfig(config);

  return async function isolate(): Promise<string> {
    const config = resolvedConfig;
    setLogLevel(config.logLevel);
    const log = useLogger();

    const { version: libraryVersion } = await readTypedJson<PackageManifest>(
      path.join(path.join(__dirname, "..", "package.json"))
    );

    log.debug("Using isolate-package version", libraryVersion);

    /**
     * If a targetPackagePath is set, we assume the configuration lives in the
     * root of the workspace. If targetPackagePath is undefined (the default),
     * we assume that the configuration lives in the target package directory.
     */
    const targetPackageDir = config.targetPackagePath
      ? path.join(process.cwd(), config.targetPackagePath)
      : process.cwd();

    const workspaceRootDir = config.targetPackagePath
      ? process.cwd()
      : path.join(targetPackageDir, config.workspaceRoot);

    const buildOutputDir = await getBuildOutputDir({
      targetPackageDir,
      buildDirName: config.buildDirName,
      tsconfigPath: config.tsconfigPath,
    });

    assert(
      fs.existsSync(buildOutputDir),
      `Failed to find build output path at ${buildOutputDir}. Please make sure you build the source before isolating it.`
    );

    log.debug("Workspace root resolved to", workspaceRootDir);
    log.debug(
      "Isolate target package",
      getRootRelativeLogPath(targetPackageDir, workspaceRootDir)
    );

    const isolateDir = path.join(targetPackageDir, config.isolateDirName);

    log.debug(
      "Isolate output directory",
      getRootRelativeLogPath(isolateDir, workspaceRootDir)
    );

    if (fs.existsSync(isolateDir)) {
      await fs.remove(isolateDir);
      log.debug("Cleaned the existing isolate output directory");
    }

    await fs.ensureDir(isolateDir);

    const tmpDir = path.join(isolateDir, "__tmp");
    await fs.ensureDir(tmpDir);

    const targetPackageManifest = await readTypedJson<PackageManifest>(
      path.join(targetPackageDir, "package.json")
    );

    /** Validate mandatory fields for the target package */
    validateManifestMandatoryFields(
      targetPackageManifest,
      getRootRelativeLogPath(targetPackageDir, workspaceRootDir)
    );

    const packageManager = detectPackageManager(workspaceRootDir);

    log.debug(
      "Detected package manager",
      packageManager.name,
      packageManager.version
    );

    if (shouldUsePnpmPack()) {
      log.debug("Use PNPM pack instead of NPM pack");
    }

    /**
     * Build a packages registry so we can find the workspace packages by name
     * and have access to their manifest files and relative paths.
     */
    const packagesRegistry = await createPackagesRegistry(
      workspaceRootDir,
      config.workspacePackages
    );

    const internalPackageNames = listInternalPackages(
      targetPackageManifest,
      packagesRegistry,
      {
        includeDevDependencies: config.includeDevDependencies,
      }
    );

    /**
     * Get the list of packages that are production dependencies (not dev-only).
     * These packages require full validation including the files field.
     */
    const productionInternalPackageNames = listInternalPackages(
      targetPackageManifest,
      packagesRegistry,
      {
        includeDevDependencies: false,
      }
    );

    /** Validate mandatory fields for all internal packages that will be isolated */
    for (const packageName of internalPackageNames) {
      const packageDef = got(packagesRegistry, packageName);
      const isProductionDependency =
        productionInternalPackageNames.includes(packageName);
      validateManifestMandatoryFields(
        packageDef.manifest,
        getRootRelativeLogPath(packageDef.absoluteDir, workspaceRootDir),
        isProductionDependency
      );
    }

    const packedFilesByName = await packDependencies({
      internalPackageNames,
      packagesRegistry,
      packDestinationDir: tmpDir,
    });

    await unpackDependencies(
      packedFilesByName,
      packagesRegistry,
      tmpDir,
      isolateDir
    );

    /** Adapt the manifest files for all the unpacked local dependencies */
    await adaptInternalPackageManifests({
      internalPackageNames,
      packagesRegistry,
      isolateDir,
      forceNpm: config.forceNpm,
      workspaceRootDir,
    });

    /** Pack the target package directory, and unpack it in the isolate location */
    await processBuildOutputFiles({
      targetPackageDir,
      tmpDir,
      isolateDir,
    });

    /**
     * Copy the target manifest file to the isolate location and adapt its
     * workspace dependencies to point to the isolated packages.
     */
    const outputManifest = await adaptTargetPackageManifest({
      manifest: targetPackageManifest,
      packagesRegistry,
      workspaceRootDir,
      config,
    });

    await writeManifest(isolateDir, outputManifest);

    /**
     * Copy patch files before generating lockfile so the lockfile contains the
     * correct paths. Only copy patches when output uses pnpm, since patched
     * dependencies are a pnpm-specific feature.
     */
    const shouldCopyPatches =
      packageManager.name === "pnpm" && !config.forceNpm;

    const copiedPatches = shouldCopyPatches
      ? await copyPatches({
          workspaceRootDir,
          targetPackageManifest: outputManifest,
          isolateDir,
          includeDevDependencies: config.includeDevDependencies,
        })
      : {};

    /** Generate an isolated lockfile based on the original one */
    const usedFallbackToNpm = await processLockfile({
      workspaceRootDir,
      isolateDir,
      packagesRegistry,
      internalDepPackageNames: internalPackageNames,
      targetPackageDir,
      targetPackageName: targetPackageManifest.name,
      targetPackageManifest: outputManifest,
      patchedDependencies:
        Object.keys(copiedPatches).length > 0 ? copiedPatches : undefined,
      config,
    });

    const hasCopiedPatches = Object.keys(copiedPatches).length > 0;

    /** Update manifest if patches were copied or npm fallback is needed */
    if (hasCopiedPatches || usedFallbackToNpm) {
      const manifest = await readManifest(isolateDir);

      if (hasCopiedPatches) {
        if (!manifest.pnpm) {
          manifest.pnpm = {};
        }
        /**
         * Extract just the paths for the manifest (lockfile needs full
         * PatchFile)
         */
        manifest.pnpm.patchedDependencies = Object.fromEntries(
          Object.entries(copiedPatches).map(([spec, patchFile]) => [
            spec,
            patchFile.path,
          ])
        );
        log.debug(
          `Added ${Object.keys(copiedPatches).length} patches to isolated package.json`
        );
      }

      if (usedFallbackToNpm) {
        /**
         * When we fall back to NPM, we set the manifest package manager to the
         * available NPM version.
         */
        const npmVersion = getVersion("npm");
        manifest.packageManager = `npm@${npmVersion}`;
      }

      await writeManifest(isolateDir, manifest);
    }

    if (packageManager.name === "pnpm" && !config.forceNpm) {
      /**
       * PNPM doesn't install dependencies of packages that are linked via link:
       * or file: specifiers. It requires the directory to be configured as a
       * workspace, so we copy the workspace config file to the isolate output.
       *
       * Rush doesn't have a pnpm-workspace.yaml file, so we generate one.
       */
      if (isRushWorkspace(workspaceRootDir)) {
        const packagesFolderNames = unique(
          internalPackageNames.map(
            (name) =>
              path.parse(got(packagesRegistry, name).rootRelativeDir).dir
          )
        );

        log.debug("Generating pnpm-workspace.yaml for Rush workspace");
        log.debug("Packages folder names:", packagesFolderNames);

        const packages = packagesFolderNames.map((x) => path.join(x, "/*"));

        writeTypedYamlSync(path.join(isolateDir, "pnpm-workspace.yaml"), {
          packages,
        });
      } else {
        fs.copyFileSync(
          path.join(workspaceRootDir, "pnpm-workspace.yaml"),
          path.join(isolateDir, "pnpm-workspace.yaml")
        );
      }
    }

    /**
     * If there is an .npmrc file in the workspace root, copy it to the isolate
     * because the settings there could affect how the lockfile is resolved.
     * Note that .npmrc is used by both NPM and PNPM for configuration.
     *
     * See also: https://pnpm.io/npmrc
     */
    const npmrcPath = path.join(workspaceRootDir, ".npmrc");

    if (fs.existsSync(npmrcPath)) {
      fs.copyFileSync(npmrcPath, path.join(isolateDir, ".npmrc"));
      log.debug("Copied .npmrc file to the isolate output");
    }

    /**
     * Clean up. Only do this when things succeed, so we can look at the temp
     * folder in case something goes wrong.
     */
    log.debug(
      "Deleting temp directory",
      getRootRelativeLogPath(tmpDir, workspaceRootDir)
    );
    await fs.remove(tmpDir);

    log.debug("Isolate completed at", isolateDir);

    return isolateDir;
  };
}

/** Keep the original function for backward compatibility */
export async function isolate(config?: IsolateConfig): Promise<string> {
  return createIsolator(config)();
}
