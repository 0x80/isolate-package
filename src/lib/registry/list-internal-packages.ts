import { got } from "get-or-throw";
import { useLogger } from "../logger";
import type { PackageManifest, PackagesRegistry } from "../types";

/**
 * Recursively collect internal packages, tracking visited nodes and the current
 * ancestor chain to detect cycles. When a cycle is detected, the package is
 * still included in the result but recursion is stopped and a warning is logged.
 */
function collectInternalPackages(
  manifest: PackageManifest,
  packagesRegistry: PackagesRegistry,
  includeDevDependencies: boolean,
  visited: Set<string>,
  ancestors: Set<string>,
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

  const result: string[] = [];

  for (const packageName of internalPackageNames) {
    result.push(packageName);

    if (ancestors.has(packageName)) {
      /** Cycle detected — log a warning and skip recursion */
      const log = useLogger();
      log.warn(
        `Circular dependency detected: "${packageName}" depends on itself through the dependency chain. This is likely caused by a workspace package name clashing with an external npm dependency.`,
      );
      continue;
    }

    if (visited.has(packageName)) {
      /** Already fully processed (diamond dependency) — skip silently */
      continue;
    }

    ancestors.add(packageName);
    const nested = collectInternalPackages(
      got(packagesRegistry, packageName).manifest,
      packagesRegistry,
      includeDevDependencies,
      visited,
      ancestors,
    );
    ancestors.delete(packageName);
    visited.add(packageName);

    result.push(...nested);
  }

  return result;
}

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
  { includeDevDependencies = false } = {},
): string[] {
  const visited = new Set<string>();
  const ancestors = new Set<string>();

  const result = collectInternalPackages(
    manifest,
    packagesRegistry,
    includeDevDependencies,
    visited,
    ancestors,
  );

  return [...new Set(result)];
}
