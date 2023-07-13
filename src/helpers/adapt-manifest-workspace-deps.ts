import { omit } from "lodash-es";
import { filterObjectUndefined } from "~/utils";
import {
	PackageManager,
  PackageManifestMinimum,
  PackagesRegistry,
  patchWorkspaceEntries,
} from ".";

export function adaptManifestWorkspaceDeps(
  {
	isPackageToIsolate,
    manifest,
    packagesRegistry,
	packageManager
  }: {
	isPackageToIsolate: boolean,
    manifest: PackageManifestMinimum,
    packagesRegistry: PackagesRegistry,
	packageManager: PackageManager,
  },
  opts: { includeDevDependencies?: boolean } = {},
): PackageManifestMinimum {
  return Object.assign(
    omit(manifest, ["scripts", "devDependencies"]),
    filterObjectUndefined({
      dependencies: manifest.dependencies
        ? patchWorkspaceEntries(isPackageToIsolate, manifest.name, manifest.dependencies, packagesRegistry, packageManager)
        : undefined,
      devDependencies:
        opts.includeDevDependencies && manifest.devDependencies
          ? patchWorkspaceEntries(isPackageToIsolate, manifest.name, manifest.devDependencies, packagesRegistry, packageManager)
          : undefined,
    }),
  );
}
