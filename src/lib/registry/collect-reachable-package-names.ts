import type { PackageManifest, PackagesRegistry } from "../types";

/**
 * Walk the target manifest and the manifests of any internal (workspace)
 * packages reachable from it, collecting every dependency name encountered
 * (both internal and external).
 *
 * The resulting set is a superset of the target's direct dependencies: it also
 * includes dependencies of internal workspace packages that will end up in the
 * isolated output. This is used to filter workspace-level
 * `patchedDependencies` so that patches for deps introduced via internal
 * packages aren't dropped.
 *
 * devDependencies of internal packages are never followed — they aren't
 * installed in the isolate. devDependencies of the *target* are followed only
 * when `includeDevDependencies` is true.
 *
 * Note: only recurses through internal packages — manifests of external deps
 * aren't available here. Deep external→external transitives therefore won't
 * appear in the set.
 */
export function collectReachablePackageNames({
  targetPackageManifest,
  packagesRegistry,
  includeDevDependencies,
}: {
  targetPackageManifest: PackageManifest;
  packagesRegistry: PackagesRegistry;
  includeDevDependencies: boolean;
}): Set<string> {
  const names = new Set<string>();
  const visitedInternal = new Set<string>();

  walk(targetPackageManifest, true);

  return names;

  function walk(manifest: PackageManifest, isTarget: boolean) {
    const depNames = [
      ...Object.keys(manifest.dependencies ?? {}),
      ...(isTarget && includeDevDependencies
        ? Object.keys(manifest.devDependencies ?? {})
        : []),
    ];

    for (const name of depNames) {
      names.add(name);

      const internalPkg = packagesRegistry[name];
      if (internalPkg && !visitedInternal.has(name)) {
        visitedInternal.add(name);
        walk(internalPkg.manifest, false);
      }
    }
  }
}
