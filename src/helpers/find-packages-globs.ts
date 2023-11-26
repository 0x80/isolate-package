import assert from "node:assert";
import path from "node:path";
import {
  inspectValue,
  readTypedJsonSync,
  readTypedYamlSync,
  useLogger,
} from "~/utils";
import { usePackageManager } from "./detect-package-manager";

/**
 * Find the globs that define where the packages are located within the
 * monorepo. This configuration is dependent on the package manager used, and I
 * don't know if we're covering all cases yet...
 */
export function findPackagesGlobs(workspaceRootDir: string) {
  const log = useLogger();

  const packageManager = usePackageManager();

  switch (packageManager.name) {
    case "pnpm": {
      const { packages: globs } = readTypedYamlSync<{ packages: string[] }>(
        path.join(workspaceRootDir, "pnpm-workspace.yaml")
      );

      log.debug("Detected pnpm packages globs:", inspectValue(globs));
      return globs;
    }
    case "yarn":
    case "npm": {
      const workspaceRootManifestPath = path.join(
        workspaceRootDir,
        "package.json"
      );

      const { workspaces } = readTypedJsonSync<{ workspaces: string[] }>(
        workspaceRootManifestPath
      );

      if (!workspaces) {
        throw new Error(
          `No workspaces field found in ${workspaceRootManifestPath}`
        );
      }

      if (Array.isArray(workspaces)) {
        return workspaces;
      } else {
        /**
         * For Yarn, workspaces could be defined as an object with { packages:
         * [], nohoist: [] }. See
         * https://classic.yarnpkg.com/blog/2018/02/15/nohoist/
         */
        const workspacesObject = workspaces as { packages?: string[] };

        assert(
          workspacesObject.packages,
          "workspaces.packages must be an array"
        );

        return workspacesObject.packages;
      }
    }
  }
}
