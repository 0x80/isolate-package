import path from "node:path";
import { isRushWorkspace } from "../utils/is-rush-workspace";
import { inferFromFiles, inferFromManifest } from "./helpers";
import type { PackageManager } from "./names";

export * from "./names";

let packageManager: PackageManager | undefined;

export function usePackageManager() {
  if (!packageManager) {
    throw Error(
      "No package manager detected. Make sure to call detectPackageManager() before usePackageManager()",
    );
  }

  return packageManager;
}

/**
 * First we check if the package manager is declared in the manifest. If it is,
 * we get the name and version from there. Otherwise we'll search for the
 * different lockfiles and ask the OS to report the installed version.
 */
export function detectPackageManager(workspaceRootDir: string): PackageManager {
  if (isRushWorkspace(workspaceRootDir)) {
    packageManager = inferFromFiles(
      path.join(workspaceRootDir, "common/config/rush"),
    );
  } else {
    /**
     * Disable infer from manifest for now. I doubt it is useful after all but
     * I'll keep the code as a reminder.
     */
    packageManager =
      inferFromManifest(workspaceRootDir) ?? inferFromFiles(workspaceRootDir);
  }

  return packageManager;
}

export function shouldUsePnpmPack() {
  const { name, majorVersion } = usePackageManager();

  return name === "pnpm" && majorVersion >= 8;
}
