import { omit } from "lodash-es";
import { filterObjectUndefined } from "~/utils";
import {
  PackageManifestMinimum,
  PackagesRegistry,
  patchWorkspaceEntries,
} from ".";

export function adaptManifestWorkspaceDeps(
  {
    manifest,
    packagesRegistry,
  }: {
    manifest: PackageManifestMinimum;
    packagesRegistry: PackagesRegistry;
  },
  opts: { includeDevDependencies?: boolean } = {}
): PackageManifestMinimum {
  return Object.assign(
    omit(manifest, ["scripts", "devDependencies"]),
    filterObjectUndefined({
      dependencies: manifest.dependencies
        ? patchWorkspaceEntries(manifest.dependencies, packagesRegistry)
        : undefined,
      devDependencies:
        opts.includeDevDependencies && manifest.devDependencies
          ? patchWorkspaceEntries(manifest.devDependencies, packagesRegistry)
          : undefined,
    })
  );
}
