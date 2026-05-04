import path from "node:path";
import {
  getLockfileImporterId as getLockfileImporterId_v8,
  readWantedLockfile as readWantedLockfile_v8,
} from "pnpm_lockfile_file_v8";
import {
  getLockfileImporterId as getLockfileImporterId_v9,
  readWantedLockfile as readWantedLockfile_v9,
} from "pnpm_lockfile_file_v9";
import { useLogger } from "~/lib/logger";
import type { PackagesRegistry } from "~/lib/types";
import { getPackageName, isRushWorkspace } from "~/lib/utils";

/**
 * Walk the workspace pnpm lockfile starting from the target package and its
 * internal workspace dependencies, returning the set of every package name
 * that will end up installed in the isolate (including deep
 * external-to-external transitives).
 *
 * Used by `copyPatches` to preserve patches for transitive deps that aren't
 * directly listed on any internal manifest. Returns an empty set on any
 * failure so the caller falls back to manifest-based reachability.
 */
export async function collectInstalledNamesFromPnpmLockfile({
  workspaceRootDir,
  targetPackageDir,
  internalDepPackageNames,
  packagesRegistry,
  majorVersion,
  includeDevDependencies,
}: {
  workspaceRootDir: string;
  targetPackageDir: string;
  internalDepPackageNames: string[];
  packagesRegistry: PackagesRegistry;
  majorVersion: number;
  includeDevDependencies: boolean;
}): Promise<Set<string>> {
  const log = useLogger();

  try {
    const useVersion9 = majorVersion >= 9;
    const isRush = isRushWorkspace(workspaceRootDir);
    const lockfileDir = isRush
      ? path.join(workspaceRootDir, "common/config/rush")
      : workspaceRootDir;

    const lockfile = useVersion9
      ? await readWantedLockfile_v9(lockfileDir, { ignoreIncompatible: false })
      : await readWantedLockfile_v8(lockfileDir, { ignoreIncompatible: false });

    if (!lockfile) {
      log.debug("No pnpm lockfile available for installed-names walk");
      return new Set();
    }

    const targetImporterId = useVersion9
      ? getLockfileImporterId_v9(workspaceRootDir, targetPackageDir)
      : getLockfileImporterId_v8(workspaceRootDir, targetPackageDir);

    const internalImporterIds = internalDepPackageNames.map((name) => {
      const pkg = packagesRegistry[name];
      if (!pkg) return null;
      return pkg.rootRelativeDir;
    });

    /**
     * Normalize separators to POSIX so Windows callers match the lockfile's
     * importer keys (mirrors generate-pnpm-lockfile.ts).
     */
    const importerIds = [targetImporterId, ...internalImporterIds]
      .filter((id): id is string => Boolean(id))
      .map((x) => x.split(path.sep).join(path.posix.sep))
      .map((x) => (isRush ? `../../${x}` : x));

    const packages = (lockfile as { packages?: Record<string, PnpmPackage> })
      .packages;

    if (!packages) {
      log.debug("Lockfile has no packages section to walk");
      return collectImporterDirectNames(
        lockfile.importers,
        importerIds,
        targetImporterId,
        isRush,
        includeDevDependencies,
      );
    }

    const names = new Set<string>();
    const seen = new Set<string>();
    const queue: string[] = [];

    for (const importerId of importerIds) {
      const importer = lockfile.importers[importerId];
      if (!importer) continue;

      const isTarget =
        importerId ===
        (isRush ? `../../${targetImporterId}` : targetImporterId);

      enqueueImporterDeps({
        importer,
        names,
        queue,
        includeDevDependencies: isTarget && includeDevDependencies,
      });
    }

    while (queue.length > 0) {
      const depPath = queue.pop()!;
      if (seen.has(depPath)) continue;
      seen.add(depPath);

      names.add(extractPackageName(depPath));

      const pkg = packages[depPath];
      if (!pkg) continue;

      enqueueResolvedDeps(pkg.dependencies, names, queue, seen);
      enqueueResolvedDeps(pkg.optionalDependencies, names, queue, seen);
    }

    return names;
  } catch (err) {
    log.debug(
      `Failed to walk pnpm lockfile for installed names: ${err instanceof Error ? err.message : String(err)}`,
    );
    return new Set();
  }
}

type ResolvedDeps = Record<string, string>;

type PnpmImporter = {
  dependencies?: ResolvedDeps;
  optionalDependencies?: ResolvedDeps;
  devDependencies?: ResolvedDeps;
};

type PnpmPackage = {
  dependencies?: ResolvedDeps;
  optionalDependencies?: ResolvedDeps;
};

function enqueueImporterDeps({
  importer,
  names,
  queue,
  includeDevDependencies,
}: {
  importer: PnpmImporter;
  names: Set<string>;
  queue: string[];
  includeDevDependencies: boolean;
}): void {
  enqueueResolvedDeps(importer.dependencies, names, queue);
  enqueueResolvedDeps(importer.optionalDependencies, names, queue);
  if (includeDevDependencies) {
    enqueueResolvedDeps(importer.devDependencies, names, queue);
  }
}

function enqueueResolvedDeps(
  deps: ResolvedDeps | undefined,
  names: Set<string>,
  queue: string[],
  seen?: Set<string>,
): void {
  if (!deps) return;

  for (const [alias, ref] of Object.entries(deps)) {
    /**
     * The alias is the name as listed in the parent's dependencies map. For
     * non-aliased installs this is also the resolved package name. We add it
     * to the set as a candidate name; visiting the actual depPath below
     * refines this with the true installed name.
     */
    names.add(alias);

    const depPath = refToRelative(ref, alias);
    if (depPath && !seen?.has(depPath)) {
      queue.push(depPath);
    }
  }
}

/**
 * Mirrors `@pnpm/dependency-path`'s `refToRelative`, which we don't expose as
 * a direct dep. Returns the depPath used as a key in `lockfile.packages`, or
 * null if the ref points to a workspace link / non-resolved entry.
 */
function refToRelative(reference: string, pkgName: string): string | null {
  if (!reference) return null;
  if (reference.startsWith("link:")) return null;
  if (reference.startsWith("@")) return reference;
  const atIndex = reference.indexOf("@");
  if (atIndex === -1) return `${pkgName}@${reference}`;
  const colonIndex = reference.indexOf(":");
  const bracketIndex = reference.indexOf("(");
  if (
    (colonIndex === -1 || atIndex < colonIndex) &&
    (bracketIndex === -1 || atIndex < bracketIndex)
  ) {
    return reference;
  }
  return `${pkgName}@${reference}`;
}

/**
 * Extract the bare package name from a pnpm depPath. Strips the optional
 * peer-resolution suffix (e.g. `(react@18.0.0)`) before parsing the name.
 */
function extractPackageName(depPath: string): string {
  const peerStart = indexOfPeersSuffix(depPath);
  const trimmed = peerStart === -1 ? depPath : depPath.substring(0, peerStart);
  return getPackageName(trimmed);
}

/**
 * Mirrors `@pnpm/dependency-path`'s `indexOfPeersSuffix`. Returns the index
 * where the peer-resolution suffix starts, or -1 if there is none.
 */
function indexOfPeersSuffix(depPath: string): number {
  if (!depPath.endsWith(")")) return -1;
  let open = 1;
  for (let i = depPath.length - 2; i >= 0; i--) {
    if (depPath[i] === "(") {
      open--;
    } else if (depPath[i] === ")") {
      open++;
    } else if (!open) {
      return i + 1;
    }
  }
  return -1;
}

/**
 * Fallback when the lockfile is missing `packages`: just return importer
 * direct dep names so we at least cover some of the graph.
 */
function collectImporterDirectNames(
  importers: Record<string, PnpmImporter>,
  importerIds: string[],
  targetImporterId: string,
  isRush: boolean,
  includeDevDependencies: boolean,
): Set<string> {
  const names = new Set<string>();
  for (const importerId of importerIds) {
    const importer = importers[importerId];
    if (!importer) continue;
    const isTarget =
      importerId === (isRush ? `../../${targetImporterId}` : targetImporterId);
    for (const name of Object.keys(importer.dependencies ?? {}))
      names.add(name);
    for (const name of Object.keys(importer.optionalDependencies ?? {})) {
      names.add(name);
    }
    if (isTarget && includeDevDependencies) {
      for (const name of Object.keys(importer.devDependencies ?? {})) {
        names.add(name);
      }
    }
  }
  return names;
}
