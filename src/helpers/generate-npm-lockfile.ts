import Arborist from "@npmcli/arborist";
import fs from "node:fs/promises";
import path from "node:path";
import { useLogger } from "../utils";
import type { PackagesRegistry } from "./create-packages-registry";

/**
 * This code is probably not working yet. It should eventually do something
 * similar to generatePnpmLockfile, but my NPM install is giving me
 * non-descriptive errors and my patience and time for now is running out...
 */
export async function generateNpmLockfile({
  targetPackageDir,
  packagesRegistry,
  isolateDir,
}: {
  targetPackageDir: string;
  packagesRegistry: PackagesRegistry;
  isolateDir: string;
}) {
  const log = useLogger();

  log.debug("Generating NPM lockfile...");

  const internalPackageNames = Object.keys(packagesRegistry);

  const arborist = new Arborist({ path: targetPackageDir });

  const { meta } = await arborist.buildIdealTree({
    // rm: internalPackageNames,
  });
  meta?.commit();

  const lockfilePath = path.join(isolateDir, "package-lock.json");

  await fs.writeFile(lockfilePath, String(meta));

  log.debug("Created lockfile at", lockfilePath);
}
