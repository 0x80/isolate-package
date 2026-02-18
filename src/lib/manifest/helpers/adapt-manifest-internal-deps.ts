import type { PackageManifest, PackagesRegistry } from "~/lib/types";
import { patchInternalEntries } from "./patch-internal-entries";

/**
 * Replace the workspace version specifiers for internal dependency with file:
 * paths. Not needed for PNPM (because we configure the isolated output as a
 * workspace), but maybe still for NPM and Yarn.
 */
export function adaptManifestInternalDeps({
  manifest,
  packagesRegistry,
  parentRootRelativeDir,
}: {
  manifest: PackageManifest;
  packagesRegistry: PackagesRegistry;
  parentRootRelativeDir?: string;
}): PackageManifest {
  const { dependencies, devDependencies } = manifest;

  return {
    ...manifest,
    dependencies: dependencies
      ? patchInternalEntries(
          dependencies,
          packagesRegistry,
          parentRootRelativeDir,
        )
      : undefined,
    devDependencies: devDependencies
      ? patchInternalEntries(
          devDependencies,
          packagesRegistry,
          parentRootRelativeDir,
        )
      : undefined,
  };
}
