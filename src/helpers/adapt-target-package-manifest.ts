import fs from "fs-extra";
import path from "node:path";
import { omit } from "ramda";
import { adaptManifestInternalDeps } from "./adapt-manifest-internal-deps";
import { useConfig } from "./config";
import type {
  PackageManifest,
  PackagesRegistry,
} from "./create-packages-registry";
import { usePackageManager } from "./detect-package-manager";

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
