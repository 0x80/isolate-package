import Arborist from "@npmcli/arborist";
import fs from "fs-extra";
import path from "node:path";
import { useLogger } from "~/lib/logger";
import { getErrorMessage } from "~/lib/utils";
import { loadNpmConfig } from "./load-npm-config";

/**
 * Generate an isolated / pruned lockfile, based on the contents of installed
 * node_modules from the monorepo root plus the adapted package manifest in the
 * isolate directory.
 */
export async function generateNpmLockfile({
  workspaceRootDir,
  isolateDir,
}: {
  workspaceRootDir: string;
  isolateDir: string;
}) {
  const log = useLogger();

  log.debug("Generating NPM lockfile the new way...");

  // const nodeModulesPath = path.join(workspaceRootDir, "node_modules");

  const origLockfilePath = path.join(workspaceRootDir, "package-lock.json");
  const isolatedLockfilePath = path.join(isolateDir, "package-lock.json");

  try {
    if (!fs.existsSync(origLockfilePath)) {
      throw new Error(
        `Failed to find package-lock.json at ${origLockfilePath}`
      );
    }

    const config = await loadNpmConfig({ npmPath: workspaceRootDir });

    const arborist = new Arborist({
      path: isolateDir,
      ...config.flat,
    });

    /**
     * One way to get NPM to match the lockfile versions seems to be to copy the
     * original lockfile to the isolate directory and run loadVirtual before
     * buildIdealTree
     */
    await fs.copy(origLockfilePath, isolatedLockfilePath, {
      overwrite: true,
    });

    log.debug("Load virtual tree");
    await arborist.loadVirtual();

    log.debug("Build ideal tree");
    const { meta } = await arborist.buildIdealTree();

    meta?.commit();

    await fs.writeFile(isolatedLockfilePath, String(meta));

    log.debug("Created lockfile at", isolatedLockfilePath);
  } catch (err) {
    log.error(`Failed to generate lockfile: ${getErrorMessage(err)}`);
    throw err;
  }
}
