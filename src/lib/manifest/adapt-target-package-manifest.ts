import fs from "fs-extra";
import path from "node:path";
import { omit } from "ramda";
import { useConfig } from "../config";
import { usePackageManager } from "../package-manager";
import type { PackageManifest, PackagesRegistry } from "../types";
import { adaptManifestInternalDeps } from "./helpers";

/**
 * Change the target package manifest file, so that:
 *
 * - Its internal dependencies point to the isolated ./packages/* directory.
 * - DevDependencies are possibly removed
 * - Scripts are possibly removed
 */
export async function adaptTargetPackageManifest(
  manifest: PackageManifest,
  packagesRegistry: PackagesRegistry,
  isolateDir: string
) {
  const packageManager = usePackageManager();
  const { includeDevDependencies } = useConfig();

  const outputManifest =
    packageManager.name === "pnpm"
      ? Object.assign(omit(["devDependencies", "scripts"], manifest), {
          devDependencies: includeDevDependencies
            ? manifest.devDependencies
            : undefined,
        })
      : adaptManifestInternalDeps(
          {
            manifest,
            packagesRegistry,
          },
          { includeDevDependencies }
        );

  await fs.writeFile(
    path.join(isolateDir, "package.json"),
    JSON.stringify(outputManifest, null, 2)
  );
}
