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
import { useLogger } from "#/lib/logger";
import type { PackageManifest, PackagesRegistry, PatchFile } from "#/lib/types";
import { getErrorMessage, isRushWorkspace } from "#/lib/utils";
import { pnpmMapImporter } from "./pnpm-map-importer";

/**
 * A pnpm catalog snapshot as stored in the lockfile: a map of catalog name
 * (e.g. "default") to a map of dependency name to its resolved entry. The
 * pinned `@pnpm/lockfile-file` types predate catalogs, so we model the shape
 * locally.
 */
type CatalogSnapshots = Record<
  string,
  Record<string, { specifier: string; version: string }>
>;

export async function generatePnpmLockfile({
  workspaceRootDir,
  targetPackageDir,
  isolateDir,
  internalDepPackageNames,
  packagesRegistry,
  targetPackageManifest,
  majorVersion,
  includeDevDependencies,
  patchedDependencies,
}: {
  workspaceRootDir: string;
  targetPackageDir: string;
  isolateDir: string;
  internalDepPackageNames: string[];
  packagesRegistry: PackagesRegistry;
  targetPackageManifest: PackageManifest;
  majorVersion: number;
  includeDevDependencies: boolean;
  /** Pre-computed patched dependencies with transformed paths from copyPatches */
  patchedDependencies?: Record<string, PatchFile>;
}) {
  /**
   * For now we will assume that the lockfile format might not change in the
   * versions after 9, because we might get lucky. If it does change, things
   * would break either way.
   */
  const useVersion9 = majorVersion >= 9;

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
          },
        )
      : await readWantedLockfile_v8(
          isRush
            ? path.join(workspaceRootDir, "common/config/rush")
            : workspaceRootDir,
          {
            ignoreIncompatible: false,
          },
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
      }),
    );

    const relevantImporterIds = [
      targetImporterId,
      /**
       * The directory paths happen to correspond with what PNPM calls the
       * importer ids in the context of a lockfile.
       */
      ...Object.values(directoryByPackageName),
      /**
       * Split the path by the OS separator and join it back with the POSIX
       * separator.
       *
       * The importerIds are built from directory names, so Windows Git Bash
       * environments will have double backslashes in their ids:
       * "packages\common" vs. "packages/common". Without this split & join, any
       * packages not on the top-level will have ill-formatted importerIds and
       * their entries will be missing from the lockfile.importers list.
       */
    ].map((x) => x.split(path.sep).join(path.posix.sep));

    log.debug("Relevant importer ids:", relevantImporterIds);

    /**
     * In a Rush workspace the original lockfile is not in the root, so the
     * importerIds have to be prefixed with `../../`, but that's not how they
     * should be stored in the isolated lockfile, so we use the prefixed ids
     * only for parsing.
     */
    const relevantImporterIdsWithPrefix = relevantImporterIds.map((x) =>
      isRush ? `../../${x}` : x,
    );

    lockfile.importers = Object.fromEntries(
      Object.entries(
        pick(lockfile.importers, relevantImporterIdsWithPrefix),
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
              directoryByPackageName,
            }),
          ];
        }

        log.debug("Setting internal package importer:", importerId);

        return [
          importerId,
          pnpmMapImporter(importerId, importer, {
            includeDevDependencies: false,
            directoryByPackageName,
          }),
        ];
      }),
    );

    log.debug("Pruning the lockfile");

    const prunedLockfile = useVersion9
      ? pruneLockfile_v9(lockfile, targetPackageManifest, ".")
      : pruneLockfile_v8(lockfile, targetPackageManifest, ".");

    /** Pruning seems to remove the overrides from the lockfile */
    if (lockfile.overrides) {
      prunedLockfile.overrides = lockfile.overrides;
    }

    /** Add packageExtensionsChecksum back to the pruned lockfile if present */
    if (lockfile.packageExtensionsChecksum) {
      prunedLockfile.packageExtensionsChecksum =
        lockfile.packageExtensionsChecksum;
    }

    /**
     * Pruning drops the catalogs snapshot, but the isolated importers keep
     * their "catalog:" specifiers (for pnpm we don't resolve catalog deps in
     * the manifest, since the output is itself a workspace). Restore the
     * snapshot, narrowed to the entries actually referenced by the retained
     * importers, so it stays in sync with the manifests and the preserved
     * pnpm-workspace.yaml (see issue #198).
     */
    const catalogs = pickReferencedCatalogs(
      (lockfile as { catalogs?: CatalogSnapshots }).catalogs,
      prunedLockfile.importers,
    );

    if (catalogs) {
      (prunedLockfile as { catalogs?: CatalogSnapshots }).catalogs = catalogs;
    }

    /**
     * Use pre-computed patched dependencies with transformed paths. The paths
     * are already adapted by copyPatches to match the isolated directory
     * structure, preserving the original folder structure (not flattened).
     */
    if (useVersion9) {
      await writeWantedLockfile_v9(isolateDir, {
        ...prunedLockfile,
        patchedDependencies,
      });
    } else {
      await writeWantedLockfile_v8(isolateDir, {
        ...prunedLockfile,
        patchedDependencies,
      });
    }

    log.debug("Created lockfile at", path.join(isolateDir, "pnpm-lock.yaml"));
  } catch (error) {
    log.error(`Failed to generate lockfile: ${getErrorMessage(error)}`);
    throw error;
  }
}

/**
 * Narrow a catalogs snapshot to only the entries referenced by the given
 * importers through "catalog:" specifiers. This mirrors what pnpm itself
 * writes, so the restored snapshot doesn't leak catalog entries belonging to
 * unrelated workspace packages that aren't part of the isolated output.
 *
 * Catalogs are a pnpm v9 feature; for older lockfiles `catalogs` is undefined
 * and this returns undefined.
 */
function pickReferencedCatalogs(
  catalogs: CatalogSnapshots | undefined,
  importers: Record<string, { specifiers?: Record<string, string> }>,
): CatalogSnapshots | undefined {
  if (!catalogs) {
    return undefined;
  }

  const referenced: CatalogSnapshots = {};

  for (const importer of Object.values(importers)) {
    for (const [depName, specifier] of Object.entries(
      importer.specifiers ?? {},
    )) {
      if (!specifier.startsWith("catalog:")) {
        continue;
      }

      /**
       * "catalog:" and "catalog:default" both map to the default catalog;
       * "catalog:<name>" maps to a named catalog.
       */
      const groupName = specifier.slice("catalog:".length) || "default";
      const entry = catalogs[groupName]?.[depName];

      if (entry) {
        (referenced[groupName] ??= {})[depName] = entry;
      }
    }
  }

  return Object.keys(referenced).length > 0 ? referenced : undefined;
}
