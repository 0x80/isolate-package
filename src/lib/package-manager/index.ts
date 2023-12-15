import { inferFromFiles } from "./helpers/infer-from-files";
import { inferFromManifest } from "./helpers/infer-from-manifest";
import type { PackageManager } from "./names";

export * from "./names";

export let packageManager: PackageManager | undefined;

export function usePackageManager() {
  if (!packageManager) {
    throw Error(
      "No package manager detected. Make sure to call detectPackageManager() before usePackageManager()"
    );
  }

  return packageManager;
}

/**
 * First we check if the package manager is declared in the manifest. If it is,
 * we get the name and version from there. Otherwise we'll search for the
 * different lockfiles and ask the OS to report the installed version.
 */
export function detectPackageManager(workspaceRoot: string): PackageManager {
  /**
   * Disable infer from manifest for now. I doubt it is useful after all but
   * I'll keep the code as a reminder.
   */
  packageManager =
    inferFromManifest(workspaceRoot) ?? inferFromFiles(workspaceRoot);

  return packageManager;
}
