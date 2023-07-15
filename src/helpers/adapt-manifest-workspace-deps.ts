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
    parentRootRelativeDir,
  }: {
    manifest: PackageManifestMinimum;
    packagesRegistry: PackagesRegistry;
    parentRootRelativeDir?: string;
  },
  opts: { includeDevDependencies?: boolean } = {}
): PackageManifestMinimum {
  return Object.assign(
    omit(manifest, ["scripts", "devDependencies"]),
    filterObjectUndefined({
      dependencies: manifest.dependencies
        ? patchWorkspaceEntries(
            manifest.dependencies,
            packagesRegistry,
            parentRootRelativeDir
          )
        : undefined,
      devDependencies:
        opts.includeDevDependencies && manifest.devDependencies
          ? patchWorkspaceEntries(
              manifest.devDependencies,
              packagesRegistry,
              parentRootRelativeDir
            )
          : undefined,
    })
  );
}
