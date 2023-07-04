import { omit } from "lodash-es";
import { filterObjectUndefined } from "~/utils";
import {
  PackageManifestMinimum,
  PackagesRegistry,
  patchWorkspaceEntries,
} from ".";

export function adaptManifestWorkspaceDeps(
  {
	isFunctionsRoot,
    manifest,
    packagesRegistry,
  }: {
	isFunctionsRoot: boolean,
    manifest: PackageManifestMinimum;
    packagesRegistry: PackagesRegistry;
  },
  opts: { includeDevDependencies?: boolean } = {},
): PackageManifestMinimum {
  return Object.assign(
    omit(manifest, ["scripts", "devDependencies"]),
    filterObjectUndefined({
      dependencies: manifest.dependencies
        ? patchWorkspaceEntries(isFunctionsRoot, manifest.name, manifest.dependencies, packagesRegistry)
        : undefined,
      devDependencies:
        opts.includeDevDependencies && manifest.devDependencies
          ? patchWorkspaceEntries(isFunctionsRoot, manifest.name, manifest.devDependencies, packagesRegistry)
          : undefined,
    }),
  );
}
