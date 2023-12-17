import { omit } from "ramda";
import type { PackageManifest, PackagesRegistry } from "~/lib/types";
import { filterObjectUndefined } from "~/lib/utils";
import { patchInternalEntries } from "./patch-internal-entries";

/**
 * Replace the workspace version specifiers for internal dependency with file:
 * paths. Not needed for PNPM (because we configure the isolated output as a
 * workspace), but maybe still for NPM and Yarn.
 */
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
    omit(["devDependencies"], manifest),
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
