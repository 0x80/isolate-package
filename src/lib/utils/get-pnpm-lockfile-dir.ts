import path from "node:path";
import { isRushWorkspace } from "./is-rush-workspace";

/**
 * The directory holding the workspace `pnpm-lock.yaml`. Rush keeps it under
 * `common/config/rush` rather than in the workspace root, and every reader of
 * the pnpm lockfile has to account for that, so the rule lives here instead of
 * being restated at each call site.
 */
export function getPnpmLockfileDir(workspaceRootDir: string) {
  return isRushWorkspace(workspaceRootDir)
    ? path.join(workspaceRootDir, "common/config/rush")
    : workspaceRootDir;
}
