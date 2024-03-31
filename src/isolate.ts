import fs from "fs-extra";
import assert from "node:assert";
import path from "node:path";
import { unique } from "remeda";
import type { IsolateConfig } from "./lib/config";
import { resolveConfig, setUserConfig } from "./lib/config";
import { processLockfile } from "./lib/lockfile";
import type { Logger } from "./lib/logger";
import { setLogLevel, setLogger, useLogger } from "./lib/logger";
import {
  adaptInternalPackageManifests,
  adaptTargetPackageManifest,
  readManifest,
  writeManifest,
} from "./lib/manifest";
import {
  getBuildOutputDir,
  packDependencies,
  processBuildOutputFiles,
  unpackDependencies,
} from "./lib/output";
import { detectPackageManager } from "./lib/package-manager";
import { getVersion } from "./lib/package-manager/helpers/infer-from-files";
import { createPackagesRegistry, listInternalPackages } from "./lib/registry";
import type { PackageManifest } from "./lib/types";
import {
  getDirname,
  getRootRelativePath,
  isRushWorkspace,
  readTypedJson,
  writeTypedYamlSync,
} from "./lib/utils";

const __dirname = getDirname(import.meta.url);

export async function isolate(
  options: { config?: IsolateConfig; logger?: Logger } = {}
) {
  if (options.logger) {
    setLogger(options.logger);
  }

  if (options.config) {
    setUserConfig(options.config);
  }

  const config = resolveConfig();

  setLogLevel(config.logLevel);

  const log = useLogger();

  const thisPackageManifest = await readTypedJson<PackageManifest>(
    path.join(path.join(__dirname, "..", "package.json"))
  );

  log.debug("Using isolate-package version", thisPackageManifest.version);

  /**
   * If a targetPackagePath is set, we assume the configuration lives in the
   * root of the workspace. If targetPackagePath is undefined (the default), we
   * assume that the configuration lives in the target package directory.
   */
  const targetPackageDir = config.targetPackagePath
    ? path.join(process.cwd(), config.targetPackagePath)
    : process.cwd();

  const workspaceRootDir = config.targetPackagePath
    ? process.cwd()
    : path.join(targetPackageDir, config.workspaceRoot);

  const buildOutputDir = await getBuildOutputDir(targetPackageDir);

  assert(
    fs.existsSync(buildOutputDir),
    `Failed to find build output path at ${buildOutputDir}. Please make sure you build the source before isolating it.`
  );

  log.debug("Workspace root resolved to", workspaceRootDir);
  log.debug(
    "Isolate target package",
    getRootRelativePath(targetPackageDir, workspaceRootDir)
  );

  const isolateDir = path.join(targetPackageDir, config.isolateDirName);

  log.debug(
    "Isolate output directory",
    getRootRelativePath(isolateDir, workspaceRootDir)
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

  const packageManager = detectPackageManager(workspaceRootDir);

  log.debug(
    "Detected package manager",
    packageManager.name,
    packageManager.version
  );

  /**
   * Build a packages registry so we can find the workspace packages by name and
   * have access to their manifest files and relative paths.
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
  await adaptInternalPackageManifests(
    internalPackageNames,
    packagesRegistry,
    isolateDir
  );

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
  });

  await writeManifest(isolateDir, outputManifest);

  /** Generate an isolated lockfile based on the original one */
  const usedFallbackToNpm = await processLockfile({
    workspaceRootDir,
    isolateDir,
    packagesRegistry,
    internalDepPackageNames: internalPackageNames,
    targetPackageDir,
    targetPackageName: targetPackageManifest.name,
    targetPackageManifest: outputManifest,
  });

  if (usedFallbackToNpm) {
    /**
     * When we fall back to NPM, we set the manifest package manager to the
     * available NPM version.
     */
    const manifest = await readManifest(isolateDir);

    const npmVersion = getVersion("npm");
    manifest.packageManager = `npm@${npmVersion}`;

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
          (name) => path.parse(packagesRegistry[name].rootRelativeDir).dir
        )
      );

      log.debug("Generating pnpm-workspace.yaml for Rush workspace");
      log.debug("Packages folder names:", packagesFolderNames);

      const packages = packagesFolderNames.map((x) => x + "/*");

      await writeTypedYamlSync(path.join(isolateDir, "pnpm-workspace.yaml"), {
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
   * because the settings there could affect how the lockfile is resolved. Note
   * that .npmrc is used by both NPM and PNPM for configuration.
   *
   * See also: https://pnpm.io/npmrc
   */
  const npmrcPath = path.join(workspaceRootDir, ".npmrc");

  if (fs.existsSync(npmrcPath)) {
    fs.copyFileSync(npmrcPath, path.join(isolateDir, ".npmrc"));
    log.debug("Copied .npmrc file to the isolate output");
  }

  /**
   * Clean up. Only so this in the happy path, so we can look at the temp folder
   * when thing go wrong.
   */
  log.debug(
    "Deleting temp directory",
    getRootRelativePath(tmpDir, workspaceRootDir)
  );
  await fs.remove(tmpDir);

  log.info("Isolate completed at", isolateDir);

  return isolateDir;
}
