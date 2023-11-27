import fs from "fs-extra";
import assert from "node:assert";
import path from "node:path";
import { adaptInternalPackageManifests } from "./helpers/adapt-internal-package-manifests";
import { adaptTargetPackageManifest } from "./helpers/adapt-target-package-manifest";
import type { IsolateConfig } from "./helpers/config";
import {
  getUserDefinedConfig,
  resolveConfig,
  setUserConfig,
} from "./helpers/config";
import {
  createPackagesRegistry,
  type PackageManifest,
} from "./helpers/create-packages-registry";
import { detectPackageManager } from "./helpers/detect-package-manager";
import { getBuildOutputDir } from "./helpers/get-build-output-dir";
import { listInternalPackages } from "./helpers/list-internal-packages";
import { packDependencies } from "./helpers/pack-dependencies";
import { processBuildOutputFiles } from "./helpers/process-build-output-files";
import { processLockfile } from "./helpers/process-lockfile";
import { unpackDependencies } from "./helpers/unpack-dependencies";
import type { Logger } from "./utils";
import {
  getDirname,
  getRootRelativePath,
  isDefined,
  readTypedJson,
  setLogLevel,
  setLogger,
  useLogger,
} from "./utils";

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

  /**
   * We want a trailing slash here. Functionally it doesn't matter, but it makes
   * the relative paths more correct in the debug output.
   */
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
  await adaptTargetPackageManifest(
    targetPackageManifest,
    packagesRegistry,
    isolateDir
  );

  const userDefinedConfig = getUserDefinedConfig();

  /**
   * If the user has not explicitly set the excludeLockfile option, we will
   * exclude the lockfile for NPM and Yarn, because we still need to figure out
   * how to generate the lockfile for those package managers.
   */
  if (!isDefined(userDefinedConfig.excludeLockfile)) {
    if (packageManager.name === "npm" || packageManager.name === "yarn") {
      config.excludeLockfile = true;
    }
  }

  if (config.excludeLockfile) {
    log.warn("Excluding the lockfile from the isolate output");
  } else {
    /** Copy and adapt the lockfile */
    await processLockfile({
      workspaceRootDir,
      isolateDir,
      packagesRegistry,
      internalDepPackageNames: internalPackageNames,
      targetPackageDir,
      targetPackageName: targetPackageManifest.name,
    });
  }

  if (packageManager.name === "pnpm") {
    /**
     * PNPM doesn't install dependencies of packages that are linked via link:
     * or file: specifiers. It requires the directory to be configured as a
     * workspace, so we copy the workspace config file to the isolate output.
     */

    fs.copyFileSync(
      path.join(workspaceRootDir, "pnpm-workspace.yaml"),
      path.join(isolateDir, "pnpm-workspace.yaml")
    );
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

// process.on("unhandledRejection", log.error);
