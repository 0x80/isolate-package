import fs from "fs-extra";
import assert from "node:assert";
import { execSync } from "node:child_process";
import path from "node:path";
import { createLogger, readTypedJsonSync } from "~/utils";
import { getLockfileFileName } from "./adapt-lockfile";
import { getConfig } from "./config";
import { PackageManifest } from "./create-packages-registry";

const supportedPackageManagerNames = ["pnpm", "yarn", "npm"] as const;

export type PackageManagerName = (typeof supportedPackageManagerNames)[number];

export type PackageManager = {
  name: PackageManagerName;
  version: string;
};

let packageManager: PackageManager | undefined;

/**
 * First we check if the package manager is declared in the manifest. If it is,
 * we get the name and version from there. Otherwise we'll search for the
 * different lockfiles and ask the OS to report the installed version.
 */
export function detectPackageManager(workspaceRoot: string): PackageManager {
  /**
   * Disable infer from manifest for now. I doubt it is useful after all but
   * I'll keep the code as a reminder.
   */
  // packageManager =
  //   inferFromManifest(workspaceRoot) ?? inferFromFiles(workspaceRoot);

  packageManager = inferFromFiles(workspaceRoot);
  return packageManager;
}

function inferFromManifest(workspaceRoot: string) {
  const log = createLogger(getConfig().logLevel);

  const rootManifest = readTypedJsonSync<PackageManifest>(
    path.join(workspaceRoot, "package.json")
  );

  if (!rootManifest.packageManager) {
    log.debug("No packageManager field found in root manifest");
    return;
  }

  const [name, version = "*"] = rootManifest.packageManager.split("@") as [
    PackageManagerName,
    string,
  ];

  assert(
    supportedPackageManagerNames.includes(name),
    `Package manager "${name}" is not currently supported`
  );

  const lockfileName = getLockfileFileName(name);

  assert(
    fs.existsSync(path.join(workspaceRoot, lockfileName)),
    `Manifest declares ${name} to be the packageManager, but failed to find ${lockfileName} in workspace root`
  );

  return { name, version };
}

function inferFromFiles(workspaceRoot: string): PackageManager {
  for (const name of supportedPackageManagerNames) {
    const lockfileName = getLockfileFileName(name);

    if (fs.existsSync(path.join(workspaceRoot, lockfileName))) {
      return { name, version: getVersion(name) };
    }
  }

  /**
   * If no lockfile was found, it could be that there is an npm shrinkwrap file.
   */
  if (fs.existsSync(path.join(workspaceRoot, "npm-shrinkwrap.json"))) {
    return { name: "npm", version: getVersion("npm") };
  }

  throw new Error(`Failed to detect package manager`);
}

function getVersion(packageManagerName: PackageManagerName): string {
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
