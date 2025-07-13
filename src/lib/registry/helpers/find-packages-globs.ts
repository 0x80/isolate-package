import assert from "node:assert";
import path from "node:path";
import { useLogger } from "../../logger";
import { usePackageManager } from "../../package-manager";
import {
  inspectValue,
  readTypedJsonSync,
  readTypedYamlSync,
} from "../../utils";

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
      const workspaceConfig = readTypedYamlSync<{ packages: string[] }>(
        path.join(workspaceRootDir, "pnpm-workspace.yaml")
      );

      if (!workspaceConfig) {
        throw new Error(
          "pnpm-workspace.yaml file is empty. Please specify packages configuration."
        );
      }

      assert(
        workspaceConfig.packages,
        "packages property must be defined in pnpm-workspace.yaml"
      );

      const { packages: globs } = workspaceConfig;

      log.debug("Detected pnpm packages globs:", inspectValue(globs));
      return globs;
    }
    case "bun":
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
