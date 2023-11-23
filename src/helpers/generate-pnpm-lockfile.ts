import pnpmExec from "@pnpm/exec";
import {
  getLockfileImporterId,
  readWantedLockfile,
  writeWantedLockfile,
} from "@pnpm/lockfile-file";
import { pruneLockfile } from "@pnpm/prune-lockfile";
import assert from "node:assert";
import path from "path";
import renameOverwrite from "rename-overwrite";
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
  const lockfile = await readWantedLockfile(workspaceRootDir, {
    ignoreIncompatible: false,
  });

  assert(lockfile, "No lockfile found");

  const allImporters = lockfile.importers;
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

  console.log("+++ importerIds", targetImporterId, internalDepImporterIds);

  for (const [importerId, importer] of Object.entries(allImporters)) {
    // This is for nested deps we use flat structure
    // if (importerId.startsWith(`${baseImporterId}/`)) {
    //   const newImporterId = importerId.slice(baseImporterId.length + 1);
    //   lockfile.importers[newImporterId] =
    //     projectSnapshotWithoutLinkedDeps(importer);
    //   continue;
    // }
    if (importerId === targetImporterId) {
      console.log("+++ setting target importer");
      // @todo convert imported linked packages
      lockfile.importers["."] = importer;
    }

    if (internalDepImporterIds.includes(importerId)) {
      console.log("+++ setting internal deps importer:", importerId);
      // @todo convert imported linked packages
      lockfile.importers[importerId] = importer;
    }
  }

  const prunedLockfile = pruneLockfile(
    lockfile,
    targetPackageManifest as PackageManifest,
    targetImporterId
  );

  await writeWantedLockfile(targetPackageDir, prunedLockfile);
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
    console.log("+++ typeof pnpmExec", pnpmExec);
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
