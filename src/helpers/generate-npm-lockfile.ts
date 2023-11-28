import Arborist from "@npmcli/arborist";
import fs from "node:fs/promises";
import path from "node:path";
import { useLogger } from "../utils";

/**
 * Generate an isolated lockfile, based on the contents of node_modules in the
 * monorepo plus the adapted package manifest in the isolate directory.
 */
export async function generateNpmLockfile({
  isolateDir,
}: {
  isolateDir: string;
}) {
  const log = useLogger();

  log.debug("Generating NPM lockfile...");

  const arborist = new Arborist({ path: isolateDir });

  const { meta } = await arborist.buildIdealTree();
  meta?.commit();

  const lockfilePath = path.join(isolateDir, "package-lock.json");

  await fs.writeFile(lockfilePath, String(meta));

  log.debug("Created lockfile at", lockfilePath);
}
