import {
  getLockfileImporterId,
  readWantedLockfile,
  writeWantedLockfile,
} from "@pnpm/lockfile-file";
import assert from "node:assert";
import path from "node:path";
import { createLogger } from "~/utils";
import { getConfig } from "./config";
import type { PackagesRegistry } from "./create-packages-registry";
import { mapImporterLinks } from "./process-lockfile";

/**
 * Code inspired by
 * https://github.com/pnpm/pnpm/tree/main/packages/make-dedicated-lockfile
 */
export async function generatePnpmLockfile({
  workspaceRootDir,
  targetPackageDir,
  isolateDir,
  internalPackages,
  packagesRegistry,
}: {
  workspaceRootDir: string;
  targetPackageDir: string;
  isolateDir: string;
  internalPackages: string[];
  packagesRegistry: PackagesRegistry;
}) {
  const config = getConfig();
  const log = createLogger(config.logLevel);

  log.debug("Generating PNPM lockfile");

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

  const internalDepImporterIds = internalPackages.map((name) => {
    const pkg = packagesRegistry[name];
    assert(pkg, `Package ${name} not found in packages registry`);
    return pkg.rootRelativeDir;
  });

  log.debug("Relevant importer ids:", targetImporterId, internalDepImporterIds);

  for (const [importerId, importer] of Object.entries(originalImporters)) {
    if (importerId === targetImporterId) {
      log.debug('Converting target importer to "."');
      lockfile.importers["."] = mapImporterLinks(importer);
    }

    if (internalDepImporterIds.includes(importerId)) {
      log.debug("Converting internal package importer:", importerId);
      lockfile.importers[importerId] = mapImporterLinks(importer);
    }
  }

  await writeWantedLockfile(isolateDir, lockfile);

  log.debug("Created lockfile at", path.join(isolateDir, "pnpm-lock.yaml"));
}
