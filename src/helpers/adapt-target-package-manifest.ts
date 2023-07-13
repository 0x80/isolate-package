import fs from "fs-extra";
import path from "node:path";
import {
	PackageManager,
  PackageManifestMinimum,
  PackagesRegistry,
  adaptManifestWorkspaceDeps,
  getConfig,
} from "~/helpers";

export async function adaptTargetPackageManifest(
  manifest: PackageManifestMinimum,
  packagesRegistry: PackagesRegistry,
  isolateDir: string,
  packageManager: PackageManager
) {
  const outputManifest = adaptManifestWorkspaceDeps(
    {
	  isPackageToIsolate: true,
      manifest,
      packagesRegistry,
	  packageManager
    },
    { includeDevDependencies: getConfig().includeDevDependencies },
  );

  await fs.writeFile(
    path.join(isolateDir, "package.json"),
    JSON.stringify(outputManifest, null, 2),
  );
}
