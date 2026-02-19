import fs from "fs-extra";
import { got } from "get-or-throw";
import path from "node:path";
import { useLogger } from "~/lib/logger";
import type { PackagesRegistry } from "~/lib/types";
import {
  getErrorMessage,
  getPackageName,
  readTypedJsonSync,
} from "~/lib/utils";

type BunWorkspaceEntry = {
  name?: string;
  version?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalPeers?: string[];
};

type BunLockfile = {
  lockfileVersion: number;
  workspaces: Record<string, BunWorkspaceEntry>;
  packages: Record<string, unknown[]>;
  trustedDependencies?: string[];
  patchedDependencies?: Record<string, string>;
  overrides?: Record<string, string>;
};

/**
 * Serialize a value to JSON with trailing commas after every array element and
 * object property, matching Bun's native bun.lock output format.
 */
export function serializeWithTrailingCommas(
  value: unknown,
  indent = 2,
): string {
  const json = JSON.stringify(value, null, indent);

  /**
   * Add trailing commas after values that precede a closing bracket/brace.
   * Apply repeatedly because consecutive closing brackets (e.g. ]\n}) need
   * multiple passes — the first pass adds a comma after the inner value, and
   * subsequent passes handle the outer brackets.
   */
  let result = json;
  let previous: string;
  do {
    previous = result;
    result = result.replace(/(["\d\w\]}-])\n(\s*[\]}])/g, "$1,\n$2");
  } while (result !== previous);

  return result;
}

/**
 * Extract dependency names from a workspace entry, optionally including
 * devDependencies.
 */
function collectDependencyNames(
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
 * Check whether a package entry represents a workspace package by examining its
 * identifier string (first element in the entry array).
 */
function isWorkspacePackageEntry(entry: unknown[]): boolean {
  const ident = entry[0];
  return typeof ident === "string" && ident.includes("@workspace:");
}

/**
 * Extract the info object from a packages entry. The position varies by type:
 * - npm packages: [ident, registry, info, checksum] -> index 2
 * - workspace packages: [ident, info] -> index 1
 * - git/github packages: [ident, info, checksum] -> index 1
 *
 * Detection: if the second element is a string (registry URL or checksum), the
 * info object is deeper. Workspace entries have only 2 elements.
 */
function getPackageInfoObject(
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
   * npm entries with registry URL: [ident, registryUrl, info, checksum].
   * The second element is a string (the registry URL).
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
 * of direct dependency names and walking through their transitive dependencies
 * in the packages section.
 */
function collectRequiredPackages(
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

export async function generateBunLockfile({
  workspaceRootDir,
  targetPackageDir,
  isolateDir,
  internalDepPackageNames,
  packagesRegistry,
  includeDevDependencies,
}: {
  workspaceRootDir: string;
  targetPackageDir: string;
  isolateDir: string;
  internalDepPackageNames: string[];
  packagesRegistry: PackagesRegistry;
  includeDevDependencies: boolean;
}) {
  const log = useLogger();

  log.debug("Generating Bun lockfile...");

  const lockfilePath = path.join(workspaceRootDir, "bun.lock");

  try {
    if (!fs.existsSync(lockfilePath)) {
      throw new Error(`Failed to find bun.lock at ${lockfilePath}`);
    }

    const lockfile = readTypedJsonSync<BunLockfile>(lockfilePath);

    /** Compute workspace keys for the target and internal deps */
    const targetWorkspaceKey = path
      .relative(workspaceRootDir, targetPackageDir)
      .split(path.sep)
      .join(path.posix.sep);

    const internalDepWorkspaceKeys = new Map<string, string>();
    for (const name of internalDepPackageNames) {
      const pkg = got(packagesRegistry, name);
      internalDepWorkspaceKeys.set(name, pkg.rootRelativeDir);
    }

    /** Build the filtered workspaces object */
    const filteredWorkspaces: Record<string, BunWorkspaceEntry> = {};

    /** Remap the target workspace to root ("") */
    const targetEntry = lockfile.workspaces[targetWorkspaceKey];
    if (targetEntry) {
      const entry = { ...targetEntry };
      if (!includeDevDependencies) {
        delete entry.devDependencies;
      }
      filteredWorkspaces[""] = entry;
    }

    /** Add internal dependency workspaces */
    for (const [, workspaceKey] of internalDepWorkspaceKeys) {
      const entry = lockfile.workspaces[workspaceKey];
      if (entry) {
        /** Strip devDependencies from internal deps */
        const filtered = { ...entry };
        delete filtered.devDependencies;
        filteredWorkspaces[workspaceKey] = filtered;
      }
    }

    /**
     * Collect all dependency names from filtered workspace entries, then
     * recursively walk through the packages section to find all transitive
     * dependencies.
     */
    const directDependencyNames = new Set<string>();
    for (const [workspaceKey, entry] of Object.entries(filteredWorkspaces)) {
      const isTarget = workspaceKey === "";
      const names = collectDependencyNames(
        entry,
        isTarget && includeDevDependencies,
      );
      for (const name of names) {
        directDependencyNames.add(name);
      }
    }

    const requiredPackages = collectRequiredPackages(
      directDependencyNames,
      lockfile.packages,
    );

    /** Also include workspace package entries for kept internal deps */
    const keptInternalDepNames = new Set(internalDepPackageNames);

    /** Filter the packages section */
    const filteredPackages: Record<string, unknown[]> = {};
    for (const [key, entry] of Object.entries(lockfile.packages)) {
      if (requiredPackages.has(key)) {
        /**
         * Skip workspace entries for packages that are not in our kept internal
         * deps. This removes workspace references to packages outside the
         * isolate.
         */
        if (isWorkspacePackageEntry(entry) && !keptInternalDepNames.has(key)) {
          continue;
        }
        filteredPackages[key] = entry;
      }
    }

    /** Also make sure workspace entries for kept internal deps are included */
    for (const name of keptInternalDepNames) {
      if (!filteredPackages[name] && lockfile.packages[name]) {
        filteredPackages[name] = lockfile.packages[name];
      }
    }

    /** Build the output lockfile preserving metadata */
    const outputLockfile: BunLockfile = {
      lockfileVersion: lockfile.lockfileVersion,
      workspaces: filteredWorkspaces,
      packages: filteredPackages,
    };

    if (lockfile.overrides && Object.keys(lockfile.overrides).length > 0) {
      outputLockfile.overrides = lockfile.overrides;
    }

    if (
      lockfile.trustedDependencies &&
      lockfile.trustedDependencies.length > 0
    ) {
      /** Filter to only include trusted dependencies that are in the output */
      const outputTrusted = lockfile.trustedDependencies.filter(
        (name) => filteredPackages[name] !== undefined,
      );
      if (outputTrusted.length > 0) {
        outputLockfile.trustedDependencies = outputTrusted;
      }
    }

    if (
      lockfile.patchedDependencies &&
      Object.keys(lockfile.patchedDependencies).length > 0
    ) {
      /** Filter to only include patches for packages in the output */
      const outputPatches: Record<string, string> = {};
      for (const [spec, patchPath] of Object.entries(
        lockfile.patchedDependencies,
      )) {
        const packageName = getPackageName(spec);
        if (filteredPackages[packageName] !== undefined) {
          outputPatches[spec] = patchPath;
        }
      }
      if (Object.keys(outputPatches).length > 0) {
        outputLockfile.patchedDependencies = outputPatches;
      }
    }

    const outputPath = path.join(isolateDir, "bun.lock");
    await fs.writeFile(outputPath, serializeWithTrailingCommas(outputLockfile));

    log.debug("Created lockfile at", outputPath);
  } catch (err) {
    log.error(`Failed to generate lockfile: ${getErrorMessage(err)}`);
    throw err;
  }
}
