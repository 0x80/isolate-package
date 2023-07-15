#!/usr/bin/env node

import fs from "fs-extra";
import assert from "node:assert";
import path from "node:path";
import sourceMaps from "source-map-support";
import {
  PackageManifestMinimum,
  adaptManifestFiles,
  adaptTargetPackageManifest,
  createPackagesRegistry,
  detectPackageManager,
  getBuildOutputDir,
  getConfig,
  listLocalDependencies,
  packDependencies,
  processBuildOutputFiles,
  processLockfile,
  unpackDependencies,
} from "~/helpers";
import { createLogger, getRootRelativePath, readTypedJson } from "~/utils";

const config = getConfig();
const log = createLogger(config.logLevel);

sourceMaps.install();

async function start() {
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

  log.debug("Workspace root", workspaceRootDir);
  log.debug(
    "Isolate target package",
    getRootRelativePath(targetPackageDir, workspaceRootDir)
  );

  const packageManager = detectPackageManager(workspaceRootDir);

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

  /**
   * Build a packages registry so we can find the workspace packages by name and
   * have access to their manifest files and relative paths.
   */
  const packagesRegistry = await createPackagesRegistry(
    workspaceRootDir,
    config.workspacePackages
  );

  const tmpDir = path.join(isolateDir, "__tmp");
  await fs.ensureDir(tmpDir);

  /**
   * PNPM pack seems to be much faster than NPM pack so we use that when PNPM is
   * detected. We log it here because the pack function will be called
   * recursively.
   */
  if (packageManager.name === "pnpm") {
    log.debug("Using pnpm to pack dependencies");
  } else {
    log.debug("Using npm to pack dependencies");
  }

  const manifest = await readTypedJson<PackageManifestMinimum>(
    path.join(targetPackageDir, "package.json")
  );

  const localDependencies = listLocalDependencies(manifest, packagesRegistry, {
    includeDevDependencies: config.includeDevDependencies,
  });

  const packedFilesByName = await packDependencies({
    localDependencies,
    packagesRegistry,
    packDestinationDir: tmpDir,
    packageManager,
  });

  await unpackDependencies(
    packedFilesByName,
    packagesRegistry,
    tmpDir,
    isolateDir
  );

  /**
   * Adapt the manifest files for all the unpacked local dependencies
   */
  await adaptManifestFiles(localDependencies, packagesRegistry, isolateDir);

  /**
   * Pack the target package directory, and unpack it in the isolate location
   */
  await processBuildOutputFiles({
    targetPackageDir,
    tmpDir,
    packageManager,
    isolateDir,
  });

  /**
   * Copy the target manifest file to the isolate location and adapt its
   * workspace dependencies to point to the isolated packages.
   */
  await adaptTargetPackageManifest(manifest, packagesRegistry, isolateDir);

  if (config.excludeLockfile) {
    log.warn("Excluding the lockfile from the isolate output");
  } else {
    /**
     * Copy and adapt the lockfile
     */
    await processLockfile({
      workspaceRootDir,
      targetPackageName: manifest.name,
      isolateDir,
      packagesRegistry,
      packageManager,
    });
  }

  /**
   * Clean up. Only so this in the happy path, so we can look at the temp folder
   * when thing go wrong.
   */
  log.debug(
    "Deleting temporary directory",
    getRootRelativePath(tmpDir, workspaceRootDir)
  );
  await fs.remove(tmpDir);

  log.debug("Stored isolate output at", isolateDir);

  log.info("Isolate completed");
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
