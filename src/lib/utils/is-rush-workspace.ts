import fs from "node:fs";
import path from "node:path";

/**
 * Detect if this is a Rush monorepo. They use a very different structure so
 * there are multiple places where we need to make exceptions based on this.
 *
 * This intentionally only checks the passed-in directory. Using the upward
 * walk of `detectMonorepo` here would break callers that pass a subdirectory
 * of the actual Rush root, because downstream code builds paths (like
 * `common/config/rush`) and lockfile importer ids relative to the same
 * directory it gets.
 */
export function isRushWorkspace(workspaceRootDir: string) {
  return fs.existsSync(path.join(workspaceRootDir, "rush.json"));
}
