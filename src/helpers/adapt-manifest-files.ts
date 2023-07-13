import fs from "fs-extra";
import path from "node:path";
import {
	PackageManager,
  PackagesRegistry,
  adaptManifestWorkspaceDeps,
  getConfig,
} from "~/helpers";

export async function adaptManifestFiles(
  localDependencies: string[],
  packagesRegistry: PackagesRegistry,
  isolateDir: string,
  packageManager: PackageManager
) {
  await Promise.all(
    localDependencies.map(async (packageName) => {
      const { manifest, rootRelativeDir } = packagesRegistry[packageName];

      const outputManifest = adaptManifestWorkspaceDeps(
        { isPackageToIsolate: false, manifest, packagesRegistry, packageManager, },
        { includeDevDependencies: getConfig().includeDevDependencies },
      );

      await fs.writeFile(
        path.join(isolateDir, rootRelativeDir, "package.json"),
        JSON.stringify(outputManifest, null, 2),
      );
    }),
  );
}
