import {
  PackageManifestMinimum,
  PackagesRegistry,
} from "./create-packages-registry";

/**
 * Recursively list the packages from dependencies (and optionally
 * devDependencies) that are found in the workspace.
 *
 * Here we do not need to rely on packages being declared as "workspace:" in the
 * manifest. We can simply compare the package names with the list of packages
 * that were found via the workspace glob patterns and added to the registry.
 */
export function listLocalDependencies(
  manifest: PackageManifestMinimum,
  packagesRegistry: PackagesRegistry,
  { includeDevDependencies = false } = {},
): string[] {
  const allWorkspacePackageNames = Object.keys(packagesRegistry);

  const localDependencyPackageNames = (
    includeDevDependencies
      ? [
          ...Object.keys(manifest.dependencies ?? {}),
          ...Object.keys(manifest.devDependencies ?? {}),
        ]
      : Object.keys(manifest.dependencies ?? {})
  ).filter((name) => allWorkspacePackageNames.includes(name));

  const nestedLocalDependencies = localDependencyPackageNames.flatMap(
    (packageName) =>
      listLocalDependencies(
        packagesRegistry[packageName].manifest,
        packagesRegistry,
        { includeDevDependencies },
      ),
  );

  return localDependencyPackageNames.concat(nestedLocalDependencies);
}
