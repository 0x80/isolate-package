import assert from "node:assert";
import fs from "node:fs/promises";
import path from "node:path";
import {
  getLockfileImporterId as getLockfileImporterId_v8,
  readWantedLockfile as readWantedLockfile_v8,
  writeWantedLockfile as writeWantedLockfile_v8,
} from "pnpm_lockfile_file_v8";
/**
 * The `_v9` alias names the lockfile format, not the package. It resolves to
 * `@pnpm/lockfile.fs`, the maintained successor of `@pnpm/lockfile-file`, whose
 * last release predates the two-document lockfile that pnpm 12 writes (see
 * issue #205). Both read and write lockfile format v9.
 */
import type { EnvLockfile } from "pnpm_lockfile_file_v9";
import {
  getLockfileImporterId as getLockfileImporterId_v9,
  readEnvLockfile as readEnvLockfile_v9,
  readWantedLockfile as readWantedLockfile_v9,
  writeEnvLockfile as writeEnvLockfile_v9,
  writeWantedLockfile as writeWantedLockfile_v9,
} from "pnpm_lockfile_file_v9";
import { pruneLockfile as pruneLockfile_v8 } from "pnpm_prune_lockfile_v8";
import { pruneLockfile as pruneLockfile_v9 } from "pnpm_prune_lockfile_v9";
import { omit, pick } from "remeda";
import { useLogger } from "#/lib/logger";
import type { PackageManifest, PackagesRegistry, PatchFile } from "#/lib/types";
import {
  getErrorMessage,
  getPnpmLockfileDir,
  isRushWorkspace,
} from "#/lib/utils";
import { pnpmMapImporter } from "./pnpm-map-importer";

/**
 * A pnpm catalog snapshot as stored in the lockfile: a map of catalog name
 * (e.g. "default") to a map of dependency name to its resolved entry. The
 * lockfile object is a union of the v8 and v9 reader types and the v8 one
 * predates catalogs, so we model the shape locally for the cast below.
 */
type CatalogSnapshots = Record<
  string,
  Record<string, { specifier: string; version: string }>
>;

export async function generatePnpmLockfile({
  workspaceRootDir,
  targetPackageDir,
  isolateDir,
  internalDepPackageNames,
  packagesRegistry,
  targetPackageManifest,
  majorVersion,
  includeDevDependencies,
  patchedDependencies,
}: {
  workspaceRootDir: string;
  targetPackageDir: string;
  isolateDir: string;
  internalDepPackageNames: string[];
  packagesRegistry: PackagesRegistry;
  targetPackageManifest: PackageManifest;
  majorVersion: number;
  includeDevDependencies: boolean;
  /** Pre-computed patched dependencies with transformed paths from copyPatches */
  patchedDependencies?: Record<string, PatchFile>;
}) {
  /**
   * For now we will assume that the lockfile format might not change in the
   * versions after 9, because we might get lucky. If it does change, things
   * would break either way.
   */
  const useVersion9 = majorVersion >= 9;

  const log = useLogger();

  log.debug("Generating PNPM lockfile...");

  try {
    const isRush = isRushWorkspace(workspaceRootDir);

    const lockfileRootDir = getPnpmLockfileDir(workspaceRootDir);

    const lockfile = useVersion9
      ? await readWantedLockfile_v9(lockfileRootDir, {
          ignoreIncompatible: false,
        })
      : await readWantedLockfile_v8(lockfileRootDir, {
          ignoreIncompatible: false,
        });

    assert(lockfile, `No input lockfile found at ${workspaceRootDir}`);

    const targetImporterId = useVersion9
      ? getLockfileImporterId_v9(workspaceRootDir, targetPackageDir)
      : getLockfileImporterId_v8(workspaceRootDir, targetPackageDir);

    const directoryByPackageName = Object.fromEntries(
      internalDepPackageNames.map((name) => {
        const pkg = packagesRegistry[name];
        assert(pkg, `Package ${name} not found in packages registry`);

        return [name, pkg.rootRelativeDir];
      }),
    );

    const relevantImporterIds = [
      targetImporterId,
      /**
       * The directory paths happen to correspond with what PNPM calls the
       * importer ids in the context of a lockfile.
       */
      ...Object.values(directoryByPackageName),
      /**
       * Split the path by the OS separator and join it back with the POSIX
       * separator.
       *
       * The importerIds are built from directory names, so Windows Git Bash
       * environments will have double backslashes in their ids:
       * "packages\common" vs. "packages/common". Without this split & join, any
       * packages not on the top-level will have ill-formatted importerIds and
       * their entries will be missing from the lockfile.importers list.
       */
    ].map((x) => x.split(path.sep).join(path.posix.sep));

    log.debug("Relevant importer ids:", relevantImporterIds);

    /**
     * In a Rush workspace the original lockfile is not in the root, so the
     * importerIds have to be prefixed with `../../`, but that's not how they
     * should be stored in the isolated lockfile, so we use the prefixed ids
     * only for parsing.
     */
    const relevantImporterIdsWithPrefix = relevantImporterIds.map((x) =>
      isRush ? `../../${x}` : x,
    );

    lockfile.importers = Object.fromEntries(
      Object.entries(
        pick(lockfile.importers, relevantImporterIdsWithPrefix),
      ).map(([prefixedImporterId, importer]) => {
        const importerId = isRush
          ? prefixedImporterId.replace("../../", "")
          : prefixedImporterId;

        if (importerId === targetImporterId) {
          log.debug("Setting target package importer on root");

          return [
            ".",
            pnpmMapImporter(".", importer, {
              includeDevDependencies,
              directoryByPackageName,
            }),
          ];
        }

        log.debug("Setting internal package importer:", importerId);

        return [
          importerId,
          pnpmMapImporter(importerId, importer, {
            includeDevDependencies: false,
            directoryByPackageName,
          }),
        ];
      }),
    );

    log.debug("Pruning the lockfile");

    /**
     * The reader and the pruner are separate packages with their own copies of
     * the lockfile types, and since v9 the reader brands its importer keys with
     * `ProjectId`. The shapes are structurally the same, so we cast to whatever
     * the matching pruner declares.
     */
    const prunedLockfile = useVersion9
      ? pruneLockfile_v9(
          lockfile as Parameters<typeof pruneLockfile_v9>[0],
          targetPackageManifest,
          ".",
        )
      : pruneLockfile_v8(
          lockfile as Parameters<typeof pruneLockfile_v8>[0],
          targetPackageManifest,
          ".",
        );

    /** Pruning seems to remove the overrides from the lockfile */
    if (lockfile.overrides) {
      prunedLockfile.overrides = lockfile.overrides;
    }

    /** Add packageExtensionsChecksum back to the pruned lockfile if present */
    if (lockfile.packageExtensionsChecksum) {
      prunedLockfile.packageExtensionsChecksum =
        lockfile.packageExtensionsChecksum;
    }

    /**
     * Pruning drops the catalogs snapshot, but the isolated importers keep
     * their "catalog:" specifiers (for pnpm we don't resolve catalog deps in
     * the manifest, since the output is itself a workspace). Restore it
     * verbatim — like overrides above — so it stays in sync with the importer
     * specifiers and the preserved pnpm-workspace.yaml catalog definitions,
     * which are themselves copied verbatim (see issue #198). pnpm tolerates
     * catalog entries that no retained importer references, so there is no need
     * to narrow the snapshot.
     */
    const catalogs = (lockfile as { catalogs?: CatalogSnapshots }).catalogs;

    if (catalogs) {
      (prunedLockfile as { catalogs?: CatalogSnapshots }).catalogs = catalogs;
    }

    /**
     * Use pre-computed patched dependencies with transformed paths. The paths
     * are already adapted by copyPatches to match the isolated directory
     * structure, preserving the original folder structure (not flattened).
     */
    if (useVersion9) {
      /**
       * pnpm 11 stores only the patch hash in the lockfile. The matching path
       * is written to pnpm-workspace.yaml by writeIsolatePnpmWorkspace.
       */
      const lockfilePatchedDependencies =
        majorVersion >= 11 && patchedDependencies
          ? Object.fromEntries(
              Object.entries(patchedDependencies).map(([spec, patchFile]) => [
                spec,
                patchFile.hash,
              ]),
            )
          : patchedDependencies;

      await writeWantedLockfile_v9(isolateDir, {
        ...prunedLockfile,
        patchedDependencies: lockfilePatchedDependencies,
      } as unknown as Parameters<typeof writeWantedLockfile_v9>[1]);

      /**
       * Must run after the project document is on disk: `writeEnvLockfile`
       * reads the existing lockfile back, extracts its main document, and
       * rewrites the file as `<env>\n---\n<main>`. Called first, it would
       * write an env-only lockfile that the project write then overwrites.
       */
      await copyEnvLockfile({
        lockfileRootDir,
        isolateDir,
        targetPackageManifest,
      });
    } else {
      await writeWantedLockfile_v8(isolateDir, {
        ...prunedLockfile,
        patchedDependencies,
      });
    }

    log.debug("Created lockfile at", path.join(isolateDir, "pnpm-lock.yaml"));
  } catch (error) {
    log.error(`Failed to generate lockfile: ${getErrorMessage(error)}`);
    throw error;
  }
}

/**
 * Since pnpm 12 the lockfile can be a stream of two YAML documents: an "env"
 * document, followed by the project document. The env document pins two
 * independent things — the package manager itself
 * (`packageManagerDependencies`) and the workspace's config dependencies
 * (`configDependencies`) — recording the resolutions and integrity hashes for
 * specifiers that live in `pnpm-workspace.yaml`. An isolated output that keeps
 * either of those but drops the env document is rejected by
 * `pnpm install --frozen-lockfile` with
 * ERR_PNPM_FROZEN_LOCKFILE_WITH_OUTDATED_LOCKFILE.
 *
 * The env document describes the environment rather than the workspace graph,
 * so there is nothing to prune from it and it is copied without pruning. The
 * one thing that can need dropping is `packageManagerDependencies`: when
 * `omitPackageManager` strips the field from the output manifest, pnpm would
 * consider that pin stale for the opposite reason. The config dependencies
 * still have to survive that, because `pnpm-workspace.yaml` is copied to the
 * isolate verbatim and keeps declaring them.
 */
async function copyEnvLockfile({
  lockfileRootDir,
  isolateDir,
  targetPackageManifest,
}: {
  lockfileRootDir: string;
  isolateDir: string;
  targetPackageManifest: PackageManifest;
}) {
  const log = useLogger();

  /**
   * The reader resolves to null for a single-document lockfile — the ordinary
   * pnpm 9 to 11 case — but it throws rather than returning null when the file
   * exists and cannot be read or parsed: it special-cases only ENOENT, and the
   * env document is passed through `yaml.load`. `readWantedLockfile` above has
   * already succeeded by this point, so failing the whole isolate on the env
   * document alone would turn a readable workspace into a hard error.
   */
  let envLockfile: EnvLockfile | null;

  try {
    envLockfile = await readEnvLockfile_v9(lockfileRootDir);
  } catch (error) {
    log.warn(
      `Could not read the lockfile env document, so the isolated lockfile will not carry one: ${getErrorMessage(error)}`,
    );
    return;
  }

  if (!envLockfile) {
    /**
     * A null result means either that there is no env document or that the
     * reader declined the one that is there. Only the second loses something,
     * so say which it was instead of returning silently.
     */
    if (await startsWithEnvDocument(lockfileRootDir)) {
      log.warn(
        "The lockfile starts with an env document but the reader did not recognize it, so the isolated lockfile will not carry one",
      );
    } else {
      log.debug("No lockfile env document to copy");
    }

    return;
  }

  if (targetPackageManifest.packageManager) {
    log.debug("Copying the lockfile env document");

    await writeEnvLockfile_v9(isolateDir, envLockfile);
    return;
  }

  const withoutPackageManager = omitEnvPackageManagerDependencies(envLockfile);

  if (!pinsConfigDependencies(withoutPackageManager)) {
    log.debug(
      "Skipping the lockfile env document because the output manifest has no packageManager field and the document pins no config dependencies",
    );
    return;
  }

  log.debug(
    "Copying the lockfile env document without its packageManagerDependencies",
  );

  await writeEnvLockfile_v9(isolateDir, withoutPackageManager);
}

/**
 * Strip the `packageManagerDependencies` pin from every importer of an env
 * document, leaving the rest of it untouched. The `packages` and `snapshots`
 * entries the pin resolved to are left in place, because nothing reads them:
 * verified by running `pnpm install --frozen-lockfile` (pnpm 12) against
 * exactly this output — the lockfile is accepted as up to date, and env
 * entries never enter the isolate's virtual store whether an importer
 * references them or not. Pruning them would be a reachability walk from the
 * remaining `configDependencies` rather than a re-resolution, so it is
 * affordable; it is left undone because the residue is some unread YAML.
 */
function omitEnvPackageManagerDependencies(
  envLockfile: EnvLockfile,
): EnvLockfile {
  return {
    ...envLockfile,
    importers: Object.fromEntries(
      Object.entries(envLockfile.importers).map(([importerId, importer]) => [
        importerId,
        omit(importer, ["packageManagerDependencies"]),
      ]),
    ) as EnvLockfile["importers"],
  };
}

/** Whether an env document pins any config dependency */
function pinsConfigDependencies(envLockfile: EnvLockfile) {
  return Object.values(envLockfile.importers).some(
    (importer) => Object.keys(importer.configDependencies ?? {}).length > 0,
  );
}

/**
 * Whether the workspace lockfile begins with a YAML document-start marker,
 * which is how pnpm 12 signals that an env document precedes the project one.
 * Used only to tell "there is no env document" apart from "there is one and
 * the reader rejected it" in the log line above.
 */
async function startsWithEnvDocument(lockfileRootDir: string) {
  try {
    const handle = await fs.open(path.join(lockfileRootDir, "pnpm-lock.yaml"));

    try {
      /**
       * Five bytes rather than four, so the CRLF spelling is recognized too —
       * the reader normalizes line endings before it looks for the marker.
       */
      const { buffer, bytesRead } = await handle.read(Buffer.alloc(5), 0, 5, 0);
      const start = buffer.subarray(0, bytesRead).toString("utf8");

      return start.startsWith("---\n") || start.startsWith("---\r\n");
    } finally {
      await handle.close();
    }
  } catch {
    return false;
  }
}
