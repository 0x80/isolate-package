import fs from "fs-extra";
import { omit } from "lodash-es";
import path from "node:path";
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
  // const outputManifest = adaptManifestInternalDeps(
  //   {
  //     manifest,
  //     packagesRegistry,
  //   },
  //   { includeDevDependencies: getConfig().includeDevDependencies }
  // );

  const includeDevDependencies = getConfig().includeDevDependencies;

  const outputManifest = Object.assign(
    omit(manifest, ["devDependencies", "scripts"]),
    {
      dependencies: manifest.dependencies,
      devDependencies: includeDevDependencies
        ? manifest.devDependencies
        : undefined,
    }
  ) as PackageManifest;

  await fs.writeFile(
    path.join(isolateDir, "package.json"),
    JSON.stringify(outputManifest, null, 2)
  );
}
