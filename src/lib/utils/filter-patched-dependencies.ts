import type { Logger } from "~/lib/logger";
import type { PackageManifest } from "~/lib/types";
import { getPackageName } from "./get-package-name";

/**
 * Filters patched dependencies to only include patches for packages that are
 * present in the target package's dependencies based on dependency type.
 */
export function filterPatchedDependencies<T>(
  patchedDependencies: Record<string, T> | undefined,
  targetPackageManifest: PackageManifest,
  includeDevDependencies: boolean,
  log: Logger
): Record<string, T> | undefined {
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

    /** Package not found in dependencies or devDependencies */
    log.debug(
      `Excluding patch: ${packageSpec} (package "${packageName}" not in target dependencies)`
    );
    excludedCount++;
  }

  log.debug(
    `Filtered patches: ${includedCount} included, ${excludedCount} excluded`
  );

  return Object.keys(filteredPatches).length > 0 ? filteredPatches : undefined;
}
