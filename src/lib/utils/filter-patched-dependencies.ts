import { useLogger } from "~/lib/logger";
import type { PackageManifest } from "~/lib/types";
import { getPackageName } from "./get-package-name";

/**
 * Filters patched dependencies to only include patches for packages that will
 * be present in the isolated output, either as a direct dependency of the
 * target or as a transitive dependency reachable through internal workspace
 * packages.
 */
export function filterPatchedDependencies<T>({
  patchedDependencies,
  targetPackageManifest,
  includeDevDependencies,
  reachableDependencyNames,
}: {
  patchedDependencies: Record<string, T> | undefined;
  targetPackageManifest: PackageManifest;
  includeDevDependencies: boolean;
  /**
   * Additional set of dependency names reachable from the target (e.g. via
   * internal workspace packages). Used to preserve patches for transitive
   * deps that are not listed directly on the target manifest.
   */
  reachableDependencyNames?: Set<string>;
}): Record<string, T> | undefined {
  const log = useLogger();
  if (!patchedDependencies || typeof patchedDependencies !== "object") {
    return undefined;
  }

  const filteredPatches: Record<string, T> = {};
  let includedCount = 0;
  let excludedCount = 0;

  for (const [packageSpec, patchInfo] of Object.entries(patchedDependencies)) {
    const packageName = getPackageName(packageSpec);

    /** Direct production dependency */
    if (targetPackageManifest.dependencies?.[packageName]) {
      filteredPatches[packageSpec] = patchInfo;
      includedCount++;
      log.debug(`Including production dependency patch: ${packageSpec}`);
      continue;
    }

    /** Direct dev dependency (respects the dev-deps flag) */
    if (
      includeDevDependencies &&
      targetPackageManifest.devDependencies?.[packageName]
    ) {
      filteredPatches[packageSpec] = patchInfo;
      includedCount++;
      log.debug(`Including dev dependency patch: ${packageSpec}`);
      continue;
    }

    /**
     * Reachable via an internal workspace package. This fires even when the
     * package is also listed in the target's devDependencies with
     * `includeDevDependencies=false`, because the package is still installed
     * in the isolate as a prod transitive.
     */
    if (reachableDependencyNames?.has(packageName)) {
      filteredPatches[packageSpec] = patchInfo;
      includedCount++;
      log.debug(`Including transitive dependency patch: ${packageSpec}`);
      continue;
    }

    /** Package won't be installed in the isolate */
    if (targetPackageManifest.devDependencies?.[packageName]) {
      log.debug(`Excluding dev dependency patch: ${packageSpec}`);
    } else {
      log.debug(
        `Excluding patch: ${packageSpec} (package "${packageName}" not reachable from target)`,
      );
    }
    excludedCount++;
  }

  log.debug(
    `Filtered patches: ${includedCount} included, ${excludedCount} excluded`,
  );

  return Object.keys(filteredPatches).length > 0 ? filteredPatches : undefined;
}
