import Arborist from "@npmcli/arborist";
import fs from "node:fs/promises";
import path from "node:path";
import { createLogger } from "~/utils";
import { getConfig } from "./config";
import type { PackagesRegistry } from "./create-packages-registry";

/** This code is experimental and not verified to work. */
export async function generateNpmLockfile({
  workspaceRootDir,
  targetPackageName,
  packagesRegistry,
  isolateDir,
}: {
  workspaceRootDir: string;
  targetPackageName: string;
  packagesRegistry: PackagesRegistry;
  isolateDir: string;
}) {
  const config = getConfig();
  const log = createLogger(config.logLevel);

  log.warn("Generating NPM lockfile NOT IMPLEMENTED YET");

  const internalPackageNames = Object.keys(packagesRegistry);
  log.debug("Internal packages", internalPackageNames);

  const arborist = new Arborist({ path: workspaceRootDir });

  const { meta } = await arborist.buildIdealTree({
    add: [targetPackageName, ...internalPackageNames],
  });
  meta?.commit();

  const lockfilePath = path.join(isolateDir, "package-lock.json");

  await fs.writeFile(lockfilePath, String(meta));

  log.debug("Created lockfile at", lockfilePath);
}
