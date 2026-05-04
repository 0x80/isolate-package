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
 * failure so the caller falls back to manifest-based reachability. When the
 * lockfile is present but lacks a `packages` section, returns just the
 * direct importer dep names.
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

    const rawTargetImporterId = useVersion9
      ? getLockfileImporterId_v9(workspaceRootDir, targetPackageDir)
      : getLockfileImporterId_v8(workspaceRootDir, targetPackageDir);

    /**
     * Normalize separators to POSIX so Windows callers match the lockfile's
     * importer keys (mirrors generate-pnpm-lockfile.ts). Applied once here so
     * the `isTarget` equality check below compares apples-to-apples — without
     * this, on Windows the raw id with backslashes wouldn't match the
     * normalized id used as the importers map key.
     */
    const targetImporterId = toLockfileImporterKey(rawTargetImporterId, isRush);

    const importerIds = [
      targetImporterId,
      ...internalDepPackageNames
        .map((name) => packagesRegistry[name]?.rootRelativeDir)
        .filter((dir): dir is string => Boolean(dir))
        .map((dir) => toLockfileImporterKey(dir, isRush)),
    ];

    const packages = (lockfile as { packages?: Record<string, PnpmPackage> })
      .packages;

    if (!packages) {
      log.debug("Lockfile has no packages section to walk");
      return collectImporterDirectNames(
        lockfile.importers,
        importerIds,
        targetImporterId,
        includeDevDependencies,
      );
    }

    const names = new Set<string>();
    const seen = new Set<string>();
    const queue: string[] = [];

    for (const importerId of importerIds) {
      const importer = lockfile.importers[importerId];
      if (!importer) continue;

      const isTarget = importerId === targetImporterId;

      enqueueImporterDeps({
        importer,
        names,
        queue,
        useVersion9,
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

      enqueueResolvedDeps(pkg.dependencies, names, queue, useVersion9, seen);
      enqueueResolvedDeps(
        pkg.optionalDependencies,
        names,
        queue,
        useVersion9,
        seen,
      );

      /**
       * Peer requirement values are name → semver-range, not resolved depPaths.
       * Just record the names so a patch on a peer-only external transitive
       * survives filtering (mirrors the bun walker and the sister manifest
       * walker, which both include peerDependencies).
       */
      collectNames(pkg.peerDependencies, names);
    }

    return names;
  } catch (err) {
    log.debug(
      `Failed to walk pnpm lockfile for installed names: ${err instanceof Error ? err.message : String(err)}`,
    );
    return new Set();
  }
}

/**
 * Convert a raw importer id (as returned by `getLockfileImporterId` or a
 * package's rootRelativeDir) to the form actually used as a key in
 * `lockfile.importers`: POSIX separators, with the Rush `../../` prefix when
 * the workspace lives under `common/config/rush`. Lockfile keys are always
 * POSIX regardless of the host OS, so backslashes are normalized
 * unconditionally rather than relying on `path.sep`.
 */
function toLockfileImporterKey(importerId: string, isRush: boolean): string {
  const posix = importerId
    .split(path.sep)
    .join(path.posix.sep)
    .replace(/\\/g, "/");
  return isRush ? `../../${posix}` : posix;
}

type ResolvedDeps = Record<string, string>;

type PnpmImporter = {
  dependencies?: ResolvedDeps;
  optionalDependencies?: ResolvedDeps;
  devDependencies?: ResolvedDeps;
  peerDependencies?: ResolvedDeps;
};

type PnpmPackage = {
  dependencies?: ResolvedDeps;
  optionalDependencies?: ResolvedDeps;
  peerDependencies?: ResolvedDeps;
};

function enqueueImporterDeps({
  importer,
  names,
  queue,
  useVersion9,
  includeDevDependencies,
}: {
  importer: PnpmImporter;
  names: Set<string>;
  queue: string[];
  useVersion9: boolean;
  includeDevDependencies: boolean;
}): void {
  enqueueResolvedDeps(importer.dependencies, names, queue, useVersion9);
  enqueueResolvedDeps(importer.optionalDependencies, names, queue, useVersion9);
  if (includeDevDependencies) {
    enqueueResolvedDeps(importer.devDependencies, names, queue, useVersion9);
  }
  /**
   * Importer peerDependencies usually aren't a separate map in the lockfile
   * (autoInstallPeers folds them into `dependencies`), but record names if
   * they happen to be present.
   */
  collectNames(importer.peerDependencies, names);
}

function enqueueResolvedDeps(
  deps: ResolvedDeps | undefined,
  names: Set<string>,
  queue: string[],
  useVersion9: boolean,
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

    const depPath = refToRelative(ref, alias, useVersion9);
    if (depPath && !seen?.has(depPath)) {
      queue.push(depPath);
    }
  }
}

function collectNames(
  deps: ResolvedDeps | undefined,
  names: Set<string>,
): void {
  if (!deps) return;
  for (const name of Object.keys(deps)) {
    names.add(name);
  }
}

/**
 * Mirrors `@pnpm/dependency-path`'s `refToRelative`. The depPath shape differs
 * between pnpm 8 (lockfile v6, normalized to v5 keys like `/foo/1.0.0`) and
 * pnpm 9 (lockfile v9 keys like `foo@1.0.0`). Returns the depPath used as a
 * key in `lockfile.packages`, or null if the ref points to a workspace link.
 */
function refToRelative(
  reference: string,
  pkgName: string,
  useVersion9: boolean,
): string | null {
  if (!reference) return null;
  if (reference.startsWith("link:")) return null;
  return useVersion9
    ? refToRelativeV9(reference, pkgName)
    : refToRelativeV8(reference, pkgName);
}

function refToRelativeV9(reference: string, pkgName: string): string | null {
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
 * v8 form: pnpm 8 (lockfile v6) is normalized on read to v5-style depPaths
 * with leading slash and `/` separator between name and version. Plain
 * version refs build that key; refs already containing a `/` (peer-suffixed
 * or pre-formed) are returned verbatim. Mirrors `@pnpm/dependency-path@2.x`.
 */
function refToRelativeV8(reference: string, pkgName: string): string | null {
  if (reference.startsWith("file:")) return reference;
  const slashIndex = reference.indexOf("/");
  const bracketIndex = reference.indexOf("(");
  const noSlashBeforeBracket =
    bracketIndex !== -1 && reference.lastIndexOf("/", bracketIndex) === -1;
  if (slashIndex === -1 || noSlashBeforeBracket) {
    return `/${pkgName}/${reference}`;
  }
  return reference;
}

/**
 * Extract the bare package name from a pnpm depPath. Strips the optional
 * peer-resolution suffix (e.g. `(react@18.0.0)`) before parsing. Handles
 * both v9 (`@scope/foo@1.0.0`) and v8 (`/@scope/foo/1.0.0`) shapes.
 */
function extractPackageName(depPath: string): string {
  const peerStart = indexOfPeersSuffix(depPath);
  const trimmed = peerStart === -1 ? depPath : depPath.substring(0, peerStart);

  if (trimmed.startsWith("/")) {
    /** v8 v5-style: `/<name>/<version>` */
    const stripped = trimmed.slice(1);
    if (stripped.startsWith("@")) {
      const secondSlash = stripped.indexOf("/", stripped.indexOf("/") + 1);
      return secondSlash === -1 ? stripped : stripped.slice(0, secondSlash);
    }
    const firstSlash = stripped.indexOf("/");
    return firstSlash === -1 ? stripped : stripped.slice(0, firstSlash);
  }

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
  includeDevDependencies: boolean,
): Set<string> {
  const names = new Set<string>();
  for (const importerId of importerIds) {
    const importer = importers[importerId];
    if (!importer) continue;
    const isTarget = importerId === targetImporterId;
    for (const name of Object.keys(importer.dependencies ?? {}))
      names.add(name);
    for (const name of Object.keys(importer.optionalDependencies ?? {})) {
      names.add(name);
    }
    for (const name of Object.keys(importer.peerDependencies ?? {})) {
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
