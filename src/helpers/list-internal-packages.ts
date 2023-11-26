import { uniq } from "lodash-es";
import type {
  PackageManifest,
  PackagesRegistry,
} from "./create-packages-registry";

/**
 * Recursively list all the packages from dependencies (and optionally
 * devDependencies) that are found in the monorepo.
 *
 * Here we do not need to rely on packages being declared with "workspace:" in
 * the package manifest. We can simply compare the package names with the list
 * of packages that were found via the workspace glob patterns and add them to
 * the registry.
 */
export function listInternalPackages(
  manifest: PackageManifest,
  packagesRegistry: PackagesRegistry,
  { includeDevDependencies = false } = {}
): string[] {
  const allWorkspacePackageNames = Object.keys(packagesRegistry);

  const internalPackageNames = (
    includeDevDependencies
      ? [
          ...Object.keys(manifest.dependencies ?? {}),
          ...Object.keys(manifest.devDependencies ?? {}),
        ]
      : Object.keys(manifest.dependencies ?? {})
  ).filter((name) => allWorkspacePackageNames.includes(name));

  const nestedInternalPackageNames = internalPackageNames.flatMap(
    (packageName) =>
      listInternalPackages(
        packagesRegistry[packageName].manifest,
        packagesRegistry,
        { includeDevDependencies }
      )
  );

  return uniq(internalPackageNames.concat(nestedInternalPackageNames));
}
