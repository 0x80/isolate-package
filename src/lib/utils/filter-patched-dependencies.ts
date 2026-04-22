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

    /** Check if it's a production dependency */
    if (targetPackageManifest.dependencies?.[packageName]) {
      filteredPatches[packageSpec] = patchInfo;
      includedCount++;
      log.debug(`Including production dependency patch: ${packageSpec}`);
      continue;
    }

    /** Check if it's a dev dependency and we should include dev dependencies */
    if (targetPackageManifest.devDependencies?.[packageName]) {
      if (includeDevDependencies) {
        filteredPatches[packageSpec] = patchInfo;
        includedCount++;
        log.debug(`Including dev dependency patch: ${packageSpec}`);
      } else {
        excludedCount++;
        log.debug(`Excluding dev dependency patch: ${packageSpec}`);
      }
      continue;
    }

    /**
     * Not a direct dep. If the package is reachable via an internal workspace
     * package, the patch should still end up in the isolated output so pnpm
     * applies it at install time.
     */
    if (reachableDependencyNames?.has(packageName)) {
      filteredPatches[packageSpec] = patchInfo;
      includedCount++;
      log.debug(`Including transitive dependency patch: ${packageSpec}`);
      continue;
    }

    /** Package not reachable from the target */
    log.debug(
      `Excluding patch: ${packageSpec} (package "${packageName}" not reachable from target)`,
    );
    excludedCount++;
  }

  log.debug(
    `Filtered patches: ${includedCount} included, ${excludedCount} excluded`,
  );

  return Object.keys(filteredPatches).length > 0 ? filteredPatches : undefined;
}
