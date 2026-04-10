import fs from "node:fs";
import path from "node:path";

export type MonorepoInfo = {
  /** Absolute path to the monorepo workspace root. */
  rootDir: string;
  /** Which workspace marker was found. "workspaces" covers npm/yarn/bun. */
  kind: "pnpm" | "workspaces" | "rush";
};

const MAX_DEPTH = 4;

/**
 * Walk upward from `startDir` looking for a monorepo workspace root. Returns
 * null if none is found within `MAX_DEPTH` levels (startDir itself plus three
 * parents) or before reaching the filesystem root.
 *
 * Supported markers:
 * - `pnpm-workspace.yaml`
 * - `package.json` containing a `workspaces` field (npm, yarn, bun)
 * - `rush.json`
 */
export function detectMonorepo(
  startDir: string = process.cwd(),
): MonorepoInfo | null {
  let current = path.resolve(startDir);
  for (let i = 0; i < MAX_DEPTH; i++) {
    if (fs.existsSync(path.join(current, "pnpm-workspace.yaml"))) {
      return { rootDir: current, kind: "pnpm" };
    }
    if (fs.existsSync(path.join(current, "rush.json"))) {
      return { rootDir: current, kind: "rush" };
    }
    const pkgPath = path.join(current, "package.json");
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as {
          workspaces?: unknown;
        };
        if (pkg.workspaces) {
          return { rootDir: current, kind: "workspaces" };
        }
      } catch {
        // Malformed package.json — ignore and continue upward.
      }
    }
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
  return null;
}
