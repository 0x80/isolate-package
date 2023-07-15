import fs from "fs-extra";
import { execSync } from "node:child_process";
import path from "node:path";

type PackageManagerName = "pnpm" | "yarn" | "npm";

export type PackageManager = {
  name: PackageManagerName;
  version: string;
};

let packageManager: PackageManager | undefined;

export function detectPackageManager(workspaceRoot: string): PackageManager {
  if (fs.existsSync(path.join(workspaceRoot, "pnpm-lock.yaml"))) {
    packageManager = { name: "pnpm", version: detectVersion("pnpm") };
  }

  if (fs.existsSync(path.join(workspaceRoot, "yarn.lock"))) {
    packageManager = { name: "yarn", version: detectVersion("yarn") };
  }

  if (fs.existsSync(path.join(workspaceRoot, "package-lock.json"))) {
    packageManager = { name: "npm", version: detectVersion("npm") };
  }

  if (!packageManager) {
    throw new Error(`Failed to detect package manager`);
  }

  return packageManager;
}

function detectVersion(packageManagerName: PackageManagerName): string {
  const buffer = execSync(`${packageManagerName} --version`);
  return buffer.toString().trim();
}

export function usePackageManager() {
  if (!packageManager) {
    throw Error(
      "No package manager detected. Make sure to call detectPackageManager() before usePackageManager()"
    );
  }

  return packageManager;
}
