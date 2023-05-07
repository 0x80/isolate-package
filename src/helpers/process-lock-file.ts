import fs from "fs-extra";
import path from "node:path";
import { createLogger } from "~/utils";
import { getConfig } from "./config";
import { PackageManager } from "./detect-package-manager";

export function getLockFileName(packageManager: PackageManager) {
  switch (packageManager) {
    case "pnpm":
      return "pnpm-lock.yaml";
    case "yarn":
      return "yarn.lock";
    case "npm":
      return "package-lock.json";
  }
}

export async function processLockfile(
  workspaceRootDir: string,
  isolateDir: string,
  packageManager: PackageManager,
) {
  const log = createLogger(getConfig().logLevel);

  const lockfileName = getLockFileName(packageManager);

  const lockfileSrcPath = path.join(workspaceRootDir, lockfileName);
  const lockfileDstPath = path.join(isolateDir, lockfileName);

  log.debug("Copying lockfile", lockfileSrcPath, "to", isolateDir);

  await fs.copy(lockfileSrcPath, lockfileDstPath);
}
