import {
  getLockfileImporterId,
  readWantedLockfile,
  writeWantedLockfile,
} from "@pnpm/lockfile-file";
import { pick } from "lodash-es";
import assert from "node:assert";
import path from "node:path";
import { createLogger } from "~/utils";
import { getConfig } from "./config";
import type { PackagesRegistry } from "./create-packages-registry";
import { mapImporterLinks } from "./process-lockfile";

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

  const targetImporterId = getLockfileImporterId(
    workspaceRootDir,
    targetPackageDir
  );

  const internalDepImporterIds = internalPackages.map((name) => {
    const pkg = packagesRegistry[name];
    assert(pkg, `Package ${name} not found in packages registry`);
    return pkg.rootRelativeDir;
  });

  const relevantImporterIds = [targetImporterId, ...internalDepImporterIds];

  log.debug("Relevant importer ids:", relevantImporterIds);

  lockfile.importers = Object.fromEntries(
    Object.entries(pick(lockfile.importers, relevantImporterIds)).map(
      ([importerId, importer]) => {
        if (importerId === targetImporterId) {
          log.debug("Setting target package importer on root");
          return [".", mapImporterLinks(importer)];
        }

        log.debug("Setting internal package importer:", importerId);
        return [importerId, mapImporterLinks(importer)];
      }
    )
  );

  await writeWantedLockfile(isolateDir, lockfile);

  log.debug("Created lockfile at", path.join(isolateDir, "pnpm-lock.yaml"));
}
