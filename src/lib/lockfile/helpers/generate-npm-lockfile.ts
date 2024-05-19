import Arborist from "@npmcli/arborist";
import fs from "fs-extra";
import path from "node:path";
import { useLogger } from "~/lib/logger";
import { getErrorMessage } from "~/lib/utils";

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

  log.debug("Generating NPM lockfile...");

  const nodeModulesPath = path.join(workspaceRootDir, "node_modules");

  try {
    if (!fs.existsSync(nodeModulesPath)) {
      throw new Error(`Failed to find node_modules at ${nodeModulesPath}`);
    }

    const arborist = new Arborist({ path: isolateDir });

    const { meta } = await arborist.buildIdealTree();

    meta?.commit();

    const lockfilePath = path.join(isolateDir, "package-lock.json");

    await fs.writeFile(lockfilePath, String(meta));

    log.debug("Created lockfile at", lockfilePath);
  } catch (err) {
    throw new Error(`Failed to generate lockfile: ${getErrorMessage(err)}`);
  }
}
