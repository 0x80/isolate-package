import path from "node:path";
import {
  createLogger,
  inspectValue,
  readTypedJsonSync,
  readTypedYamlSync,
} from "~/utils";
import { getConfig } from "./config";
import { detectPackageManager } from "./detect-package-manager";

/**
 * Find the globs that define where the packages are located within the
 * monorepo. This configuration is dependent on the package manager used, and I
 * don't know if we're covering all cases yet...
 */
export function findPackagesGlobs(workspaceRootDir: string) {
  const log = createLogger(getConfig().logLevel);

  const packageManager = detectPackageManager(workspaceRootDir);

  switch (packageManager) {
    case "pnpm": {
      const { packages: globs } = readTypedYamlSync<{ packages: string[] }>(
        path.join(workspaceRootDir, "pnpm-workspace.yaml"),
      );

      log.debug("Detected pnpm packages globs:", inspectValue(globs));
      return globs;
    }
    case "yarn":
    case "npm": {
      const workspaceRootManifestPath = path.join(
        workspaceRootDir,
        "package.json",
      );

      const { workspaces } = readTypedJsonSync<{ workspaces: string[] }>(
        workspaceRootManifestPath,
      );

      if (!workspaces) {
        throw new Error(
          `No workspaces field found in ${workspaceRootManifestPath}`,
        );
      }

      return workspaces;
    }
  }
}
