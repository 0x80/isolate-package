import fs from "fs-extra";
import path from "node:path";
import {
  type BunLockfile,
  collectDependencyNames,
  collectRequiredPackages,
} from "#/lib/lockfile/helpers/bun-lockfile";
import { useLogger } from "#/lib/logger";
import type { PackagesRegistry } from "#/lib/types";
import { readTypedJsonSync } from "#/lib/utils";

/**
 * Walk the workspace bun.lock starting from the target package and its
 * internal workspace dependencies, returning the set of every package name
 * that will end up installed in the isolate (including deep
 * external-to-external transitives).
 *
 * Used by `copyPatches` to preserve patches for transitive deps that aren't
 * directly listed on any internal manifest. Returns an empty set on any
 * failure so the caller falls back to manifest-based reachability.
 */
export function collectInstalledNamesFromBunLockfile({
  workspaceRootDir,
  targetPackageDir,
  internalDepPackageNames,
  packagesRegistry,
  includeDevDependencies,
}: {
  workspaceRootDir: string;
  targetPackageDir: string;
  internalDepPackageNames: string[];
  packagesRegistry: PackagesRegistry;
  includeDevDependencies: boolean;
}): Set<string> {
  const log = useLogger();

  try {
    const lockfilePath = path.join(workspaceRootDir, "bun.lock");
    if (!fs.existsSync(lockfilePath)) {
      log.debug("No bun.lock available for installed-names walk");
      return new Set();
    }

    const lockfile = readTypedJsonSync(lockfilePath) as BunLockfile;

    const targetWorkspaceKey = path
      .relative(workspaceRootDir, targetPackageDir)
      .split(path.sep)
      .join(path.posix.sep);

    const internalWorkspaceKeys = internalDepPackageNames
      .map((name) => {
        const pkg = packagesRegistry[name];
        if (!pkg) return null;
        return pkg.rootRelativeDir.split(path.sep).join(path.posix.sep);
      })
      .filter(Boolean) as string[];

    const directDependencyNames = new Set<string>();

    const targetEntry = lockfile.workspaces[targetWorkspaceKey];
    if (targetEntry) {
      for (const name of collectDependencyNames(
        targetEntry,
        includeDevDependencies,
      )) {
        directDependencyNames.add(name);
      }
    }

    for (const workspaceKey of internalWorkspaceKeys) {
      const entry = lockfile.workspaces[workspaceKey];
      if (!entry) continue;
      /** Internal workspace deps never bring in their devDependencies */
      for (const name of collectDependencyNames(entry, false)) {
        directDependencyNames.add(name);
      }
    }

    return collectRequiredPackages(directDependencyNames, lockfile.packages);
  } catch (error) {
    log.debug(
      `Failed to walk bun.lock for installed names: ${error instanceof Error ? error.message : String(error)}`,
    );
    return new Set();
  }
}
