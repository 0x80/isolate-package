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
  findBuildOutputDir,
  getConfig,
  listLocalDependencies,
  packDependencies,
  processBuildOutputFiles,
  processLockfile,
  unpackDependencies,
} from "~/helpers";
import { createLogger, getRelativePath, readTypedJson } from "~/utils";

const config = getConfig();
const log = createLogger(config.logLevel);

sourceMaps.install();

async function start() {
  const targetPackageDir = process.cwd();

  const buildOutputDir = await findBuildOutputDir(targetPackageDir);

  assert(
    fs.existsSync(buildOutputDir),
    `Failed to find build output path at ${buildOutputDir}. Please make sure you built the source before isolating it.`
  );

  /**
   * We want a trailing slash here. Functionally it doesn't matter, but it makes
   * the relative paths print correctly in the cli output.
   */
  const workspaceRootDir = path.join(
    targetPackageDir,
    config.workspaceRoot,
    "/"
  );

  log.debug("Workspace root", workspaceRootDir);
  log.debug(
    "Isolate target package",
    getRelativePath(targetPackageDir, workspaceRootDir)
  );

  const packageManager = detectPackageManager(workspaceRootDir);

  const isolateDir = path.join(targetPackageDir, config.isolateOutDir);

  log.debug(
    "Isolate output dir",
    getRelativePath(isolateDir, workspaceRootDir)
  );

  /**
   * Make sure the isolate dir exists so we can write to it
   */
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
  if (packageManager === "pnpm") {
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

  /**
   * Clean up
   */
  log.debug(
    "Deleting temporary directory",
    getRelativePath(tmpDir, workspaceRootDir)
  );
  await fs.remove(tmpDir);

  log.info(
    "Isolate completed at",
    path.join("./", getRelativePath(isolateDir, targetPackageDir))
  );
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
