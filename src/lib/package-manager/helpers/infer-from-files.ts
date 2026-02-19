import fs from "fs-extra";
import { execSync } from "node:child_process";
import path from "node:path";
import { getErrorMessage } from "~/lib/utils";
import { getMajorVersion } from "~/lib/utils/get-major-version";
import type { PackageManager, PackageManagerName } from "../names";
import { getLockfileFileName, supportedPackageManagerNames } from "../names";

export function inferFromFiles(workspaceRoot: string): PackageManager {
  for (const name of supportedPackageManagerNames) {
    const lockfileName = getLockfileFileName(name);

    if (fs.existsSync(path.join(workspaceRoot, lockfileName))) {
      try {
        const version = getVersion(name);

        return { name, version, majorVersion: getMajorVersion(version) };
      } catch (err) {
        throw new Error(
          `Failed to find package manager version for ${name}: ${getErrorMessage(err)}`,
          { cause: err },
        );
      }
    }
  }

  /** If no lockfile was found, it could be that there is an npm shrinkwrap file. */
  if (fs.existsSync(path.join(workspaceRoot, "npm-shrinkwrap.json"))) {
    const version = getVersion("npm");

    return { name: "npm", version, majorVersion: getMajorVersion(version) };
  }

  throw new Error(`Failed to detect package manager`);
}

export function getVersion(packageManagerName: PackageManagerName): string {
  const buffer = execSync(`${packageManagerName} --version`);
  return buffer.toString().trim();
}
