import { omit } from "lodash-es";
import { filterObjectUndefined } from "~/utils";
import type {
  PackageManifest,
  PackagesRegistry,
} from "./create-packages-registry";
import { patchInternalEntries } from "./patch-internal-entries";

export function adaptManifestInternalDeps(
  {
    manifest,
    packagesRegistry,
    parentRootRelativeDir,
  }: {
    manifest: PackageManifest;
    packagesRegistry: PackagesRegistry;
    parentRootRelativeDir?: string;
  },
  opts: { includeDevDependencies?: boolean } = {}
): PackageManifest {
  return Object.assign(
    omit(manifest, ["devDependencies"]),
    filterObjectUndefined({
      dependencies: manifest.dependencies
        ? patchInternalEntries(
            manifest.dependencies,
            packagesRegistry,
            parentRootRelativeDir
          )
        : undefined,
      devDependencies:
        opts.includeDevDependencies && manifest.devDependencies
          ? patchInternalEntries(
              manifest.devDependencies,
              packagesRegistry,
              parentRootRelativeDir
            )
          : undefined,
    })
  );
}
