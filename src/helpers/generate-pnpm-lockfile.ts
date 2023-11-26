import {
  getLockfileImporterId,
  readWantedLockfile,
  writeWantedLockfile,
} from "@pnpm/lockfile-file";
import { pick } from "lodash-es";
import assert from "node:assert";
import path from "node:path";
import { useLogger } from "~/utils";
import { useConfig } from "./config";
import type { PackagesRegistry } from "./create-packages-registry";
import { pnpmMapImporter } from "./process-lockfile";

export async function generatePnpmLockfile({
  workspaceRootDir,
  targetPackageDir,
  isolateDir,
  internalDepPackageNames,
  packagesRegistry,
}: {
  workspaceRootDir: string;
  targetPackageDir: string;
  isolateDir: string;
  internalDepPackageNames: string[];
  packagesRegistry: PackagesRegistry;
}) {
  const { includeDevDependencies } = useConfig();
  const log = useLogger();

  log.debug("Generating PNPM lockfile");

  const lockfile = await readWantedLockfile(workspaceRootDir, {
    ignoreIncompatible: false,
  });

  assert(lockfile, "No lockfile found");

  const targetImporterId = getLockfileImporterId(
    workspaceRootDir,
    targetPackageDir
  );

  const directoryByPackageName = Object.fromEntries(
    internalDepPackageNames.map((name) => {
      const pkg = packagesRegistry[name];
      assert(pkg, `Package ${name} not found in packages registry`);
      return [name, pkg.rootRelativeDir];
    })
  );

  const relevantImporterIds = [
    targetImporterId,
    /**
     * The directory paths happen to correspond with what PNPM calls the
     * importer ids in the context of a lockfile.
     */
    ...Object.values(directoryByPackageName),
  ];

  log.debug("Relevant importer ids:", relevantImporterIds);

  lockfile.importers = Object.fromEntries(
    Object.entries(pick(lockfile.importers, relevantImporterIds)).map(
      ([importerId, importer]) => {
        if (importerId === targetImporterId) {
          log.debug("Setting target package importer on root");

          return [
            ".",
            pnpmMapImporter(importer, {
              includeDevDependencies,
              directoryByPackageName,
            }),
          ];
        }

        log.debug("Setting internal package importer:", importerId);

        return [
          importerId,
          pnpmMapImporter(importer, {
            includeDevDependencies,
            directoryByPackageName,
          }),
        ];
      }
    )
  );

  await writeWantedLockfile(isolateDir, lockfile);

  log.debug("Created lockfile at", path.join(isolateDir, "pnpm-lock.yaml"));
}
