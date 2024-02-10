import fs from "fs-extra";
import { execSync } from "node:child_process";
import path from "node:path";
import { useLogger } from "~/lib/logger";
import { getErrorMessage } from "~/lib/utils";

/**
 * Generate an isolated / pruned lockfile, based on the existing lockfile from
 * the monorepo root plus the adapted package manifest in the isolate
 * directory.
 */
export async function generateYarnLockfile({
  workspaceRootDir,
  isolateDir,
}: {
  workspaceRootDir: string;
  isolateDir: string;
}) {
  const log = useLogger();

  log.info("Generating Yarn lockfile...");

  const origLockfilePath = path.join(workspaceRootDir, "yarn.lock");
  const newLockfilePath = path.join(isolateDir, "yarn.lock");

  if (!fs.existsSync(origLockfilePath)) {
    throw new Error(`Failed to find lockfile at ${origLockfilePath}`);
  }

  log.debug(`Copy original yarn.lock to the isolate output`);

  try {
    await fs.copyFile(origLockfilePath, newLockfilePath);

    // const origWorkingDirectory = process.cwd();

    // process.chdir(isolateDir);

    /**
     * Running install with the original lockfile in the same directory will
     * generate a pruned version of the lockfile.
     */
    log.debug(`Running local install`);
    execSync(`yarn install --cwd ${isolateDir}`);

    // process.chdir(origWorkingDirectory);

    log.debug("Generated lockfile at", newLockfilePath);
  } catch (err) {
    throw new Error(`Failed to generate lockfile: ${getErrorMessage(err)}`);
  }
}
