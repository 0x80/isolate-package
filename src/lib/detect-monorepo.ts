import fs from "node:fs";
import path from "node:path";
import { readTypedJsonSync } from "./utils";

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
        const pkg = readTypedJsonSync<{ workspaces?: unknown }>(pkgPath);
        if (hasWorkspacesField(pkg.workspaces)) {
          return { rootDir: current, kind: "workspaces" };
        }
      } catch {
        /** Malformed package.json — ignore and continue upward. */
      }
    }
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
  return null;
}

/**
 * Mirrors the shapes accepted by the rest of the codebase (see
 * `find-packages-globs.ts`): an array of globs, or a Yarn-style object with a
 * `packages` array. Anything else is treated as not a workspace root.
 */
function hasWorkspacesField(value: unknown): boolean {
  if (Array.isArray(value)) return true;
  if (typeof value === "object" && value !== null) {
    const packages = (value as { packages?: unknown }).packages;
    return Array.isArray(packages);
  }
  return false;
}
