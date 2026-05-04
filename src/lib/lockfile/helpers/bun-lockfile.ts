/**
 * Shared types and walker logic for the Bun workspace lockfile (`bun.lock`).
 *
 * Used both when generating the isolated lockfile and when computing the set
 * of package names that will end up installed in the isolate (so that patches
 * for deep transitive deps are preserved).
 */

export type BunWorkspaceEntry = {
  name?: string;
  version?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalPeers?: string[];
};

export type BunLockfile = {
  lockfileVersion: number;
  workspaces: Record<string, BunWorkspaceEntry>;
  packages: Record<string, unknown[]>;
  trustedDependencies?: string[];
  patchedDependencies?: Record<string, string>;
  overrides?: Record<string, string>;
};

/** Extract dependency names from a workspace entry. */
export function collectDependencyNames(
  entry: BunWorkspaceEntry,
  includeDevDependencies: boolean,
): string[] {
  const names = new Set<string>();

  for (const name of Object.keys(entry.dependencies ?? {})) {
    names.add(name);
  }
  for (const name of Object.keys(entry.optionalDependencies ?? {})) {
    names.add(name);
  }
  for (const name of Object.keys(entry.peerDependencies ?? {})) {
    names.add(name);
  }

  if (includeDevDependencies) {
    for (const name of Object.keys(entry.devDependencies ?? {})) {
      names.add(name);
    }
  }

  return [...names];
}

/**
 * Check whether a package entry represents a workspace package by examining
 * its identifier string (first element in the entry array).
 */
export function isWorkspacePackageEntry(entry: unknown[]): boolean {
  const ident = entry[0];
  return typeof ident === "string" && ident.includes("@workspace:");
}

/**
 * Extract the info object from a packages entry. The position varies by type:
 * - npm packages: [ident, registry, info, checksum] -> index 2
 * - workspace packages: [ident, info] -> index 1
 * - git/github packages: [ident, info, checksum] -> index 1
 *
 * Detection: if the second element is a string (registry URL or checksum),
 * the info object is deeper. Workspace entries have only 2 elements.
 */
export function getPackageInfoObject(
  entry: unknown[],
): Record<string, unknown> | undefined {
  if (entry.length <= 1) return undefined;

  /** Workspace entries: [ident, info] */
  if (isWorkspacePackageEntry(entry)) {
    return typeof entry[1] === "object"
      ? (entry[1] as Record<string, unknown>)
      : undefined;
  }

  /**
   * npm entries with registry URL: [ident, registryUrl, info, checksum]. The
   * second element is a string (the registry URL).
   */
  if (typeof entry[1] === "string") {
    return typeof entry[2] === "object"
      ? (entry[2] as Record<string, unknown>)
      : undefined;
  }

  /** git/tarball entries: [ident, info, checksum] */
  return typeof entry[1] === "object"
    ? (entry[1] as Record<string, unknown>)
    : undefined;
}

/**
 * Recursively collect all package keys that are required, starting from a set
 * of direct dependency names and walking through their transitive
 * dependencies in the packages section.
 */
export function collectRequiredPackages(
  directDependencyNames: Set<string>,
  packages: Record<string, unknown[]>,
): Set<string> {
  const required = new Set<string>();
  const queue = [...directDependencyNames];

  while (queue.length > 0) {
    const name = queue.pop()!;

    if (required.has(name)) continue;

    const entry = packages[name];
    if (!entry) continue;

    required.add(name);

    const info = getPackageInfoObject(entry);
    if (!info) continue;

    /** Walk transitive dependencies from the info object */
    for (const depField of [
      "dependencies",
      "optionalDependencies",
      "peerDependencies",
    ]) {
      const deps = info[depField];
      if (deps && typeof deps === "object") {
        for (const depName of Object.keys(deps as Record<string, unknown>)) {
          if (!required.has(depName)) {
            queue.push(depName);
          }
        }
      }
    }
  }

  return required;
}
