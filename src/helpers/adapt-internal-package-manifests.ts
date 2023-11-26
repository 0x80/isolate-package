import fs from "fs-extra";
import { omit } from "lodash-es";
import path from "node:path";
import type { PackagesRegistry } from "~/helpers/create-packages-registry";
import { adaptManifestInternalDeps } from "./adapt-manifest-internal-deps";
import { getConfig } from "./config";
import { usePackageManager } from "./detect-package-manager";

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
  const packageManager = usePackageManager();
  const includeDevDependencies = getConfig().includeDevDependencies;

  await Promise.all(
    internalPackageNames.map(async (packageName) => {
      const { manifest, rootRelativeDir } = packagesRegistry[packageName];

      const outputManifest =
        packageManager.name === "pnpm"
          ? Object.assign(
              /**
               * For internal dependencies we want to omit the peerDependencies,
               * because installing these is the responsibility of the consuming
               * app / service, and otherwise the frozen lockfile install will
               * error since the package file contains something that is not
               * referenced in the lockfile.
               */
              omit(manifest, ["devDependencies", "peerDependencies"]),
              {
                dependencies: manifest.dependencies,
                devDependencies: includeDevDependencies
                  ? manifest.devDependencies
                  : undefined,
              }
            )
          : adaptManifestInternalDeps(
              {
                manifest,
                packagesRegistry,
                parentRootRelativeDir: rootRelativeDir,
              },
              { includeDevDependencies }
            );

      await fs.writeFile(
        path.join(isolateDir, rootRelativeDir, "package.json"),
        JSON.stringify(outputManifest, null, 2)
      );
    })
  );
}
