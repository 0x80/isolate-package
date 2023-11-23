#!/usr/bin/env node
/**
 * For PNPM the hash bang at the top of the script was not required, but Yarn 3
 * did not seem to execute without it.
 */

/**
 * A word about used terminology:
 *
 * The various package managers, while being very similar, seem to use a
 * different definition for the term "workspace". If you want to read the code
 * it might be good to know that I consider the workspace to be the monorepo
 * itself, in other words, the overall structure that holds all the packages.
 */
import fs from "fs-extra";
import assert from "node:assert";
import path from "node:path";
import sourceMaps from "source-map-support";
import {
  createLogger,
  getDirname,
  getRootRelativePath,
  readTypedJson,
} from "~/utils";
import { adaptInternalPackageManifests } from "./helpers/adapt-manifest-files";
import { adaptTargetPackageManifest } from "./helpers/adapt-target-package-manifest";
import { getConfig } from "./helpers/config";
import {
  createPackagesRegistry,
  type PackageManifest,
} from "./helpers/create-packages-registry";
import { detectPackageManager } from "./helpers/detect-package-manager";
import { generateNpmLockfile } from "./helpers/generate-npm-lockfile";
import { generatePnpmLockfile } from "./helpers/generate-pnpm-lockfile";
import { getBuildOutputDir } from "./helpers/get-build-output-dir";
import { listInternalDependencies } from "./helpers/list-internal-dependencies";
import { packDependencies } from "./helpers/pack-dependencies";
import { processBuildOutputFiles } from "./helpers/process-build-output-files";
import { unpackDependencies } from "./helpers/unpack-dependencies";

const config = getConfig();
const log = createLogger(config.logLevel);

sourceMaps.install();

async function start() {
  const __dirname = getDirname(import.meta.url);

  const thisPackageManifest = await readTypedJson<PackageManifest>(
    path.join(path.join(__dirname, "..", "package.json"))
  );

  log.debug("Running isolate-package version", thisPackageManifest.version);

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

  const internalDependencies = listInternalDependencies(
    targetPackageManifest,
    packagesRegistry,
    {
      includeDevDependencies: config.includeDevDependencies,
    }
  );

  const packedFilesByName = await packDependencies({
    internalDependencies,
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
    internalDependencies,
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

  if (config.excludeLockfile) {
    log.warn("Excluding the lockfile from the isolate output");
  } else {
    switch (packageManager.name) {
      case "npm":
        /** Generate the lockfile */
        await generateNpmLockfile({
          workspaceRootDir,
          targetPackageName: targetPackageManifest.name,
          isolateDir,
          packagesRegistry,
        });
        break;
      case "pnpm":
        await generatePnpmLockfile({
          workspaceRootDir,
          targetPackageDir,
          isolateDir,
          internalDependencies,
          packagesRegistry,
        });
        break;
      default:
        log.warn(
          `Creating isolated lockfiles for ${packageManager.name} is currently not supported`
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
}

start().catch((err) => {
  if (err instanceof Error) {
    log.error(err.stack);
    process.exit(1);
  } else {
    console.error(err);
  }
});

process.on("unhandledRejection", log.error);
