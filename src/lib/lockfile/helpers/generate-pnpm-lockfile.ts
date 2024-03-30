import {
  getLockfileImporterId,
  readWantedLockfile,
  writeWantedLockfile,
} from "@pnpm/lockfile-file";
import { pruneLockfile } from "@pnpm/prune-lockfile";
import assert from "node:assert";
import path from "node:path";
import { pick } from "remeda";
import { useConfig } from "~/lib/config";
import { useLogger } from "~/lib/logger";
import type { PackageManifest, PackagesRegistry } from "~/lib/types";
import { getErrorMessage } from "~/lib/utils";
import { pnpmMapImporter } from "./pnpm-map-importer";

export async function generatePnpmLockfile({
  workspaceRootDir,
  targetPackageDir,
  isolateDir,
  internalDepPackageNames,
  packagesRegistry,
  targetPackageManifest,
}: {
  workspaceRootDir: string;
  targetPackageDir: string;
  isolateDir: string;
  internalDepPackageNames: string[];
  packagesRegistry: PackagesRegistry;
  targetPackageManifest: PackageManifest;
}) {
  const { includeDevDependencies, includePatchedDependencies } = useConfig();
  const log = useLogger();

  log.info("Generating PNPM lockfile...");

  try {
    const lockfile = await readWantedLockfile(workspaceRootDir, {
      ignoreIncompatible: false,
    });

    assert(lockfile, `No input lockfile found at ${workspaceRootDir}`);

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
                includePatchedDependencies,
                directoryByPackageName,
              }),
            ];
          }

          log.debug("Setting internal package importer:", importerId);

          return [
            importerId,
            pnpmMapImporter(importer, {
              includeDevDependencies,
              includePatchedDependencies,
              directoryByPackageName,
            }),
          ];
        }
      )
    );

    log.debug("Pruning the lockfile");
    const prunedLockfile = await pruneLockfile(
      lockfile,
      targetPackageManifest,
      "."
    );

    await writeWantedLockfile(isolateDir, {
      ...prunedLockfile,
      /**
       * Don't know how to map the patched dependencies yet, so we just include
       * them but I don't think it would work like this. The important thing for
       * now is that they are omitted by default, because that is the most
       * common use case.
       */
      patchedDependencies: includePatchedDependencies
        ? lockfile.patchedDependencies
        : undefined,
    });

    log.debug("Created lockfile at", path.join(isolateDir, "pnpm-lock.yaml"));
  } catch (err) {
    throw new Error(`Failed to generate lockfile: ${getErrorMessage(err)}`);
  }
}
