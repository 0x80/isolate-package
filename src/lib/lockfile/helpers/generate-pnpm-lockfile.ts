import assert from "node:assert";
import path from "node:path";
import {
  getLockfileImporterId as getLockfileImporterId_v8,
  readWantedLockfile as readWantedLockfile_v8,
  writeWantedLockfile as writeWantedLockfile_v8,
} from "pnpm_lockfile_file_v8";
import {
  getLockfileImporterId as getLockfileImporterId_v9,
  readWantedLockfile as readWantedLockfile_v9,
  writeWantedLockfile as writeWantedLockfile_v9,
} from "pnpm_lockfile_file_v9";
import { pruneLockfile as pruneLockfile_v8 } from "pnpm_prune_lockfile_v8";
import { pruneLockfile as pruneLockfile_v9 } from "pnpm_prune_lockfile_v9";
import { pick } from "remeda";
import { useConfig } from "~/lib/config";
import { useLogger } from "~/lib/logger";
import type { PackageManifest, PackagesRegistry } from "~/lib/types";
import { getErrorMessage, isRushWorkspace } from "~/lib/utils";
import { pnpmMapImporter } from "./pnpm-map-importer";

export async function generatePnpmLockfile({
  workspaceRootDir,
  targetPackageDir,
  isolateDir,
  internalDepPackageNames,
  packagesRegistry,
  targetPackageManifest,
  majorVersion,
}: {
  workspaceRootDir: string;
  targetPackageDir: string;
  isolateDir: string;
  internalDepPackageNames: string[];
  packagesRegistry: PackagesRegistry;
  targetPackageManifest: PackageManifest;
  majorVersion: number;
}) {
  /**
   * For now we will assume that the lockfile format might not change in the
   * versions after 9, because we might get lucky. If it does change, things
   * would break either way.
   */
  const useVersion9 = majorVersion >= 9;

  const { includeDevDependencies, includePatchedDependencies } = useConfig();
  const log = useLogger();

  log.debug("Generating PNPM lockfile...");

  try {
    const isRush = isRushWorkspace(workspaceRootDir);

    const lockfile = useVersion9
      ? await readWantedLockfile_v9(
          isRush
            ? path.join(workspaceRootDir, "common/config/rush")
            : workspaceRootDir,
          {
            ignoreIncompatible: false,
          }
        )
      : await readWantedLockfile_v8(
          isRush
            ? path.join(workspaceRootDir, "common/config/rush")
            : workspaceRootDir,
          {
            ignoreIncompatible: false,
          }
        );

    assert(lockfile, `No input lockfile found at ${workspaceRootDir}`);

    const targetImporterId = useVersion9
      ? getLockfileImporterId_v9(workspaceRootDir, targetPackageDir)
      : getLockfileImporterId_v8(workspaceRootDir, targetPackageDir);

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

    /**
     * In a Rush workspace the original lockfile is not in the root, so the
     * importerIds have to be prefixed with `../../`, but that's not how they
     * should be stored in the isolated lockfile, so we use the prefixed ids
     * only for parsing.
     */
    const relevantImporterIdsWithPrefix = relevantImporterIds.map((x) =>
      isRush ? `../../${x}` : x
    );

    lockfile.importers = Object.fromEntries(
      Object.entries(
        pick(lockfile.importers, relevantImporterIdsWithPrefix)
      ).map(([prefixedImporterId, importer]) => {
        const importerId = isRush
          ? prefixedImporterId.replace("../../", "")
          : prefixedImporterId;

        if (importerId === targetImporterId) {
          log.debug("Setting target package importer on root");

          return [
            ".",
            pnpmMapImporter(".", importer, {
              includeDevDependencies,
              includePatchedDependencies,
              directoryByPackageName,
            }),
          ];
        }

        log.debug("Setting internal package importer:", importerId);

        return [
          importerId,
          pnpmMapImporter(importerId, importer, {
            includeDevDependencies,
            includePatchedDependencies,
            directoryByPackageName,
          }),
        ];
      })
    );

    log.debug("Pruning the lockfile");

    const prunedLockfile = useVersion9
      ? await pruneLockfile_v9(lockfile, targetPackageManifest, ".")
      : await pruneLockfile_v8(lockfile, targetPackageManifest, ".");

    /** Pruning seems to remove the overrides from the lockfile */
    if (lockfile.overrides) {
      prunedLockfile.overrides = lockfile.overrides;
    }

    /**
     * Don't know how to map the patched dependencies yet, so we just include
     * them but I don't think it would work like this. The important thing for
     * now is that they are omitted by default, because that is the most common
     * use case.
     */
    const patchedDependencies = includePatchedDependencies
      ? lockfile.patchedDependencies
      : undefined;

    useVersion9
      ? await writeWantedLockfile_v9(isolateDir, {
          ...prunedLockfile,
          patchedDependencies,
        })
      : await writeWantedLockfile_v8(isolateDir, {
          ...prunedLockfile,
          patchedDependencies,
        });

    log.debug("Created lockfile at", path.join(isolateDir, "pnpm-lock.yaml"));
  } catch (err) {
    log.error(`Failed to generate lockfile: ${getErrorMessage(err)}`);
    throw err;
  }
}
