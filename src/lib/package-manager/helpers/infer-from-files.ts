import fs from "fs-extra";
import { execSync } from "node:child_process";
import path from "node:path";
import type { PackageManager, PackageManagerName } from "../names";
import { getLockfileFileName, supportedPackageManagerNames } from "../names";

export function inferFromFiles(workspaceRoot: string): PackageManager {
  for (const name of supportedPackageManagerNames) {
    const lockfileName = getLockfileFileName(name);

    if (fs.existsSync(path.join(workspaceRoot, lockfileName))) {
      return { name, version: getVersion(name) };
    }
  }

  /** If no lockfile was found, it could be that there is an npm shrinkwrap file. */
  if (fs.existsSync(path.join(workspaceRoot, "npm-shrinkwrap.json"))) {
    return { name: "npm", version: getVersion("npm") };
  }

  throw new Error(`Failed to detect package manager`);
}
function getVersion(packageManagerName: PackageManagerName): string {
  const buffer = execSync(`${packageManagerName} --version`);
  return buffer.toString().trim();
}
