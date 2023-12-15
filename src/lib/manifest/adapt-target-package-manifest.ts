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
      ? /**
         * For PNPM the output itself is a workspace so we can preserve the specifiers
         * with "workspace:*" in the output manifest.
         */
        Object.assign(omit(["devDependencies", "scripts"], manifest), {
          devDependencies: includeDevDependencies
            ? manifest.devDependencies
            : undefined,
        })
      : /** For other package managers we replace the links to internal dependencies */
        adaptManifestInternalDeps(
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
