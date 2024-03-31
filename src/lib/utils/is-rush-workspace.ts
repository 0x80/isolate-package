import fs from "node:fs";
import path from "node:path";

/**
 * Detect if this is a Rush monorepo. They use a very different structure so
 * there are multiple places where we need to make exceptions based on this.
 */
export function isRushWorkspace(workspaceRootDir: string) {
  return fs.existsSync(path.join(workspaceRootDir, "rush.json"));
}
