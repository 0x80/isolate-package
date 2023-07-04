import fs from "fs-extra";
import path from "node:path";
import {
  PackageManifestMinimum,
  PackagesRegistry,
  adaptManifestWorkspaceDeps,
  getConfig,
} from "~/helpers";

export async function adaptTargetPackageManifest(
  manifest: PackageManifestMinimum,
  packagesRegistry: PackagesRegistry,
  isolateDir: string,
) {
  const outputManifest = adaptManifestWorkspaceDeps(
    {
	  isFunctionsRoot: true,
      manifest,
      packagesRegistry,
    },
    { includeDevDependencies: getConfig().includeDevDependencies },
  );

  await fs.writeFile(
    path.join(isolateDir, "package.json"),
    JSON.stringify(outputManifest, null, 2),
  );
}
