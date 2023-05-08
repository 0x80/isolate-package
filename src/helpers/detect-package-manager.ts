import fs from "fs-extra";
import path from "node:path";

export type PackageManager = "pnpm" | "yarn" | "npm";

export function detectPackageManager(workspaceRoot: string): PackageManager {
  if (fs.existsSync(path.join(workspaceRoot, "pnpm-lock.yaml"))) {
    return "pnpm";
  }

  if (fs.existsSync(path.join(workspaceRoot, "yarn.lock"))) {
    return "yarn";
  }

  if (fs.existsSync(path.join(workspaceRoot, "package-lock.json"))) {
    return "npm";
  }

  throw new Error(`Failed to detect package manager`);
}
