import Arborist from "@npmcli/arborist";
import fs from "fs-extra";
import path from "node:path";
import { useLogger } from "~/lib/logger";
import { getErrorMessage, inspectValue } from "~/lib/utils";

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

  log.info("Generating NPM lockfile...");

  const origRootNodeModulesPath = path.join(workspaceRootDir, "node_modules");
  const tempRootNodeModulesPath = path.join(isolateDir, "node_modules");

  let hasMovedNodeModules = false;

  try {
    if (!fs.existsSync(origRootNodeModulesPath)) {
      throw new Error(
        `Failed to find node_modules at ${origRootNodeModulesPath}`
      );
    }

    log.debug(`Temporarily moving node_modules to the isolate output`);

    await fs.move(origRootNodeModulesPath, tempRootNodeModulesPath);
    hasMovedNodeModules = true;

    const arborist = new Arborist({ path: isolateDir });

    log.debug(`Building tree...`);
    const { meta } = await arborist.buildIdealTree();

    meta?.commit();

    const lockfilePath = path.join(isolateDir, "package-lock.json");

    await fs.writeFile(lockfilePath, String(meta));

    log.debug("Created lockfile at", lockfilePath);
  } catch (err: any) {
    console.error(inspectValue(err));
    log.error(`Failed to generate lockfile: ${getErrorMessage(err)}`);
    /**
     * If lockfile creation fails we can technically still continue with the
     * rest. Not sure if that is desirable.
     */
  } finally {
    if (hasMovedNodeModules) {
      log.debug(`Restoring node_modules to the workspace root`);
      await fs.move(tempRootNodeModulesPath, origRootNodeModulesPath);
    }
  }
}
