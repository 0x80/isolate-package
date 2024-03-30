import fs from "node:fs";
import path from "node:path";

export function isRushWorkspace(workspaceRootDir: string) {
  /** Rush monorepos have a very different structure */
  return fs.existsSync(path.join(workspaceRootDir, "rush.json"));
}
