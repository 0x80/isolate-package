import fs from "fs-extra";
import path from "node:path";
import type { PackagesRegistry } from "~/helpers/create-packages-registry";
import { adaptManifestInternalDeps } from "./adapt-manifest-internal-deps";
import { getConfig } from "./config";

/**
 * Adapt the manifest files of all the isolated internal packages (excluding the
 * target package), so that their dependencies point to the other isolated
 * packages in the same folder.
 */
export async function adaptInternalPackageManifests(
  internalPackageNames: string[],
  packagesRegistry: PackagesRegistry,
  isolateDir: string
) {
  await Promise.all(
    internalPackageNames.map(async (packageName) => {
      const { manifest, rootRelativeDir } = packagesRegistry[packageName];

      const outputManifest = adaptManifestInternalDeps(
        { manifest, packagesRegistry, parentRootRelativeDir: rootRelativeDir },
        { includeDevDependencies: getConfig().includeDevDependencies }
      );

      await fs.writeFile(
        path.join(isolateDir, rootRelativeDir, "package.json"),
        JSON.stringify(outputManifest, null, 2)
      );
    })
  );
}
