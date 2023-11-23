import fs from "fs-extra";
import path from "node:path";
import { adaptManifestInternalDeps } from "./adapt-manifest-internal-deps";
import { getConfig } from "./config";
import type {
  PackageManifest,
  PackagesRegistry,
} from "./create-packages-registry";

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
