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
import type { Logger } from "~/lib/logger";
import { useLogger } from "~/lib/logger";
import type { PackageManifest, PackagesRegistry } from "~/lib/types";
import { getErrorMessage, isRushWorkspace } from "~/lib/utils";
import { pnpmMapImporter } from "./pnpm-map-importer";

function filterPatchedDependencies(
  originalPatchedDependencies: any,
  targetPackageManifest: PackageManifest,
  includeDevDependencies: boolean,
  log: Logger
): any {
  if (!originalPatchedDependencies || typeof originalPatchedDependencies !== 'object') {
    return undefined;
  }

  const getPackageName = (packageSpec: string): string => {
    // Handle scoped packages: @scope/package@version -> @scope/package
    if (packageSpec.startsWith('@')) {
      const parts = packageSpec.split('@');
      return `@${parts[1]}`;
    }
    // Handle regular packages: package@version -> package
    return packageSpec.split('@')[0];
  };

  const filteredPatches: any = {};
  let includedCount = 0;
  let excludedCount = 0;

  for (const [packageSpec, patchInfo] of Object.entries(originalPatchedDependencies)) {
    const packageName = getPackageName(packageSpec);
    
    // Check if it's a regular dependency
    if (targetPackageManifest.dependencies?.[packageName]) {
      filteredPatches[packageSpec] = patchInfo;
      includedCount++;
      log.debug(`Including production dependency patch in lockfile: ${packageSpec}`);
      continue;
    }
    
    // Check if it's a dev dependency and we should include dev dependencies
    if (targetPackageManifest.devDependencies?.[packageName]) {
      if (includeDevDependencies) {
        filteredPatches[packageSpec] = patchInfo;
        includedCount++;
        log.debug(`Including dev dependency patch in lockfile: ${packageSpec}`);
      } else {
        excludedCount++;
        log.debug(`Excluding dev dependency patch from lockfile: ${packageSpec}`);
      }
      continue;
    }
    
    // Package not found in dependencies or devDependencies
    log.debug(`Excluding patch from lockfile: ${packageSpec} (package "${packageName}" not found in target dependencies)`);
    excludedCount++;
  }

  log.debug(`Filtered patched dependencies: ${includedCount} included, ${excludedCount} excluded`);
  
  return Object.keys(filteredPatches).length > 0 ? filteredPatches : undefined;
}

export async function generatePnpmLockfile({
  workspaceRootDir,
  targetPackageDir,
  isolateDir,
  internalDepPackageNames,
  packagesRegistry,
  targetPackageManifest,
  majorVersion,
  includeDevDependencies,
  includePatchedDependencies,
}: {
  workspaceRootDir: string;
  targetPackageDir: string;
  isolateDir: string;
  internalDepPackageNames: string[];
  packagesRegistry: PackagesRegistry;
  targetPackageManifest: PackageManifest;
  majorVersion: number;
  includeDevDependencies: boolean;
  includePatchedDependencies: boolean;
}) {
  /**
   * PNPM 10+ uses the same lockfile format as version 9, but with lockfileVersion: '10.0'
   * Since @pnpm/lockfile-file v10 packages don't exist yet, we use v9 packages for PNPM 10+.
   * This should work because PNPM maintains backward compatibility, but we log a warning
   * to alert users of potential edge cases.
   */
  const useVersion9 = majorVersion >= 9;
  
  const log = useLogger();
  
  if (majorVersion >= 10) {
    log.debug(`Using PNPM v${majorVersion} with v9 lockfile packages - this should work but may have limitations`);
  }

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
            pnpmMapImporter(".", importer!, {
              includeDevDependencies,
              includePatchedDependencies,
              directoryByPackageName,
            }),
          ];
        }

        log.debug("Setting internal package importer:", importerId);

        return [
          importerId,
          pnpmMapImporter(importerId, importer!, {
            includeDevDependencies: false, // Only include dev deps for target package
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
     * Filter patched dependencies to only include patches for packages that will
     * actually be present in the isolated lockfile based on dependency type.
     * We read patchedDependencies from workspace root, but filter based on target package dependencies.
     */
    const patchedDependencies = includePatchedDependencies
      ? filterPatchedDependencies(
          lockfile.patchedDependencies,
          targetPackageManifest,
          includeDevDependencies,
          log
        )
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
