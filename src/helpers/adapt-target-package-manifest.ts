import fs from "fs-extra";
import path from "node:path";
import {
  PackageManifest,
  PackagesRegistry,
  adaptManifestInternalDeps,
  getConfig,
} from "~/helpers";

/**
 * Change the target package manifest file, so that:
 * - its internal dependencies point to the isolated ./packages/* directory.
 * - devDependencies are possibly removed
 * - scripts are possibly removed
 */
export async function adaptTargetPackageManifest(
  manifest: PackageManifest,
  packagesRegistry: PackagesRegistry,
  isolateDir: string
) {
  const outputManifest = adaptManifestInternalDeps(
    {
      manifest,
      packagesRegistry,
    },
    { includeDevDependencies: getConfig().includeDevDependencies }
  );

  await fs.writeFile(
    path.join(isolateDir, "package.json"),
    JSON.stringify(outputManifest, null, 2)
  );
}
