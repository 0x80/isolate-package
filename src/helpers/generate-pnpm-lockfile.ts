import pnpmExec from "@pnpm/exec";
import {
  getLockfileImporterId,
  readWantedLockfile,
  writeWantedLockfile,
} from "@pnpm/lockfile-file";
import assert from "node:assert";
import path from "path";
import renameOverwrite from "rename-overwrite";
import { createLogger } from "~/utils";
import { mapImporterLinks } from "./adapt-lockfile";
import { getConfig } from "./config";
import type {
  PackageManifest,
  PackagesRegistry,
} from "./create-packages-registry";

/**
 * Code inspired by
 * https://github.com/pnpm/pnpm/tree/main/packages/make-dedicated-lockfile
 */
export async function generatePnpmLockfile({
  workspaceRootDir,
  targetPackageDir,
  isolateDir,
  internalDependencies,
  packagesRegistry,
  targetPackageManifest,
}: {
  workspaceRootDir: string;
  targetPackageDir: string;
  isolateDir: string;
  internalDependencies: string[];
  packagesRegistry: PackagesRegistry;
  targetPackageManifest: PackageManifest;
}) {
  const config = getConfig();
  const log = createLogger(config.logLevel);

  log.info("Generating PNPM lockfile");

  const lockfile = await readWantedLockfile(workspaceRootDir, {
    ignoreIncompatible: false,
  });

  assert(lockfile, "No lockfile found");

  const originalImporters = lockfile.importers;
  lockfile.importers = {};

  const targetImporterId = getLockfileImporterId(
    workspaceRootDir,
    targetPackageDir
  );

  const internalDepImporterIds = internalDependencies.map((name) => {
    const pkg = packagesRegistry[name];
    assert(pkg, `Package ${name} not found in packages registry`);
    return pkg.rootRelativeDir;
  });

  log.debug("Relevant importer ids:", targetImporterId, internalDepImporterIds);

  for (const [importerId, importer] of Object.entries(originalImporters)) {
    if (importerId === targetImporterId) {
      log.debug('Converting target importer to "."');

      lockfile.importers["."] = mapImporterLinks(importer);
      // lockfile.importers["."] = importer;
    }

    if (internalDepImporterIds.includes(importerId)) {
      log.debug("Converting internal package importer:", importerId);
      // console.log("+++ importer", mapImporterLinks(importer));
      lockfile.importers[importerId] = mapImporterLinks(importer);
      // lockfile.importers[importerId] = importer;
    }
  }

  // const prunedLockfile = pruneLockfile(
  //   lockfile,
  //   targetPackageManifest as PackageManifest,
  //   targetImporterId
  // );

  // await writeWantedLockfile(targetPackageDir, lockfile);
  await writeWantedLockfile(isolateDir, lockfile);

  // const publishManifest = await createExportableManifest(
  //   targetPackageDir,
  //   manifest
  // );
  // await writeProjectManifest(publishManifest);

  const modulesDir = path.join(targetPackageDir, "node_modules");
  const tmp = path.join(isolateDir, "tmp_node_modules");
  const tempModulesDir = path.join(isolateDir, "node_modules/.tmp");

  let modulesRenamed = false;
  try {
    await renameOverwrite(modulesDir, tmp);
    await renameOverwrite(tmp, tempModulesDir);
    modulesRenamed = true;
  } catch (err: any) {
    // eslint-disable-line
    if (err["code"] !== "ENOENT") throw err;
  }

  try {
    log.debug("+++ typeof pnpmExec", pnpmExec);
    // @ts-expect-error That mysterious ESM default import mismatch again
    await pnpmExec.default(
      [
        "install",
        "--frozen-lockfile",
        "--lockfile-dir=.",
        "--fix-lockfile",
        "--filter=.",
        "--no-link-workspace-packages",
        "--config.dedupe-peer-dependents=false", // TODO: remove this. It should work without it
      ],
      {
        cwd: targetPackageDir,
      }
    );
  } finally {
    if (modulesRenamed) {
      await renameOverwrite(tempModulesDir, tmp);
      await renameOverwrite(tmp, modulesDir);
    }
    // await writeProjectManifest(manifest);
  }
}
