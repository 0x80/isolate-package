import fs from "fs-extra";
import path from "node:path";
import { readPnpmLockfile } from "#/lib/lockfile/read-pnpm-lockfile";
import { useLogger } from "#/lib/logger";
import { usePackageManager } from "#/lib/package-manager";
import { collectReachablePackageNames } from "#/lib/registry";
import type {
  PackageManifest,
  PackagesRegistry,
  PatchFile,
  PnpmSettings,
} from "#/lib/types";
import {
  filterPatchedDependencies,
  getRootRelativeLogPath,
  getPnpmLockfileDir,
  readTypedJson,
  readTypedYamlSync,
} from "#/lib/utils";
import { collectInstalledNamesFromBunLockfile } from "./collect-installed-names-bun";
import { collectInstalledNamesFromPnpmLockfile } from "./collect-installed-names-pnpm";

export async function copyPatches({
  workspaceRootDir,
  targetPackageDir,
  targetPackageManifest,
  packagesRegistry,
  internalDepPackageNames,
  isolateDir,
  includeDevDependencies,
}: {
  workspaceRootDir: string;
  targetPackageDir: string;
  targetPackageManifest: PackageManifest;
  packagesRegistry: PackagesRegistry;
  internalDepPackageNames: string[];
  isolateDir: string;
  includeDevDependencies: boolean;
}): Promise<Record<string, PatchFile>> {
  const log = useLogger();

  const { name: packageManagerName, majorVersion } = usePackageManager();

  let patchedDependencies: Record<string, string> | undefined;

  /**
   * Only try reading pnpm-workspace.yaml for pnpm workspaces. Bun workspaces
   * don't have this file and the warning would be noisy.
   */
  if (packageManagerName === "pnpm") {
    try {
      const pnpmSettings = readTypedYamlSync(
        path.join(workspaceRootDir, "pnpm-workspace.yaml"),
      ) as PnpmSettings | undefined;
      patchedDependencies = pnpmSettings?.patchedDependencies;
    } catch (error) {
      log.warn(
        `Could not read pnpm-workspace.yaml: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  if (!patchedDependencies || Object.keys(patchedDependencies).length === 0) {
    if (packageManagerName === "pnpm") {
      log.debug(
        "No patched dependencies found in pnpm-workspace.yaml; Falling back to workspace root package.json",
      );
    } else {
      log.debug(
        "Reading patched dependencies from workspace root package.json",
      );
    }

    try {
      const workspaceRootManifest = (await readTypedJson(
        path.join(workspaceRootDir, "package.json"),
      )) as PackageManifest;
      /** PNPM stores patches under pnpm.patchedDependencies, Bun at the top level */
      patchedDependencies =
        workspaceRootManifest?.pnpm?.patchedDependencies ??
        workspaceRootManifest?.patchedDependencies;
    } catch (error) {
      log.warn(
        `Could not read workspace root package.json: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  if (!patchedDependencies || Object.keys(patchedDependencies).length === 0) {
    log.debug("No patched dependencies found in workspace root package.json");
    return {};
  }

  log.debug(
    `Found ${Object.keys(patchedDependencies).length} patched dependencies in workspace`,
  );

  /**
   * Collect the set of dependency names reachable from the target (direct deps
   * plus deps introduced by internal workspace packages). Patches for names in
   * this set are preserved even when the target doesn't list them directly —
   * see issue #167.
   */
  const reachableDependencyNames = collectReachablePackageNames({
    targetPackageManifest,
    packagesRegistry,
    includeDevDependencies,
  });

  /**
   * Manifest-based reachability misses external→external transitives because
   * external manifests aren't loaded here. Walk the package-manager's
   * lockfile to also pick up those names, so a patch for a deeply-nested
   * external dep (e.g. `@react-pdf/render` reached via `@react-pdf/renderer`)
   * survives isolation.
   */
  const lockfileInstalledNames =
    packageManagerName === "pnpm"
      ? await collectInstalledNamesFromPnpmLockfile({
          workspaceRootDir,
          targetPackageDir,
          internalDepPackageNames,
          packagesRegistry,
          majorVersion,
          includeDevDependencies,
        })
      : packageManagerName === "bun"
        ? collectInstalledNamesFromBunLockfile({
            workspaceRootDir,
            targetPackageDir,
            internalDepPackageNames,
            packagesRegistry,
            includeDevDependencies,
          })
        : new Set<string>();

  for (const name of lockfileInstalledNames) {
    reachableDependencyNames.add(name);
  }

  const filteredPatches = filterPatchedDependencies({
    patchedDependencies,
    targetPackageManifest,
    includeDevDependencies,
    reachableDependencyNames,
  });

  if (!filteredPatches) {
    return {};
  }

  /**
   * Read the pnpm lockfile to get patch hashes. Bun doesn't store hashes in
   * its lockfile so we skip this for Bun.
   */
  const lockfilePatchResult =
    packageManagerName === "pnpm"
      ? await readLockfilePatchedDependencies(workspaceRootDir)
      : undefined;

  const patchFilesToCopy: {
    packageSpec: string;
    sourcePath: string;
    targetPath: string;
  }[] = [];
  const copiedPatches: Record<string, PatchFile> = {};

  for (const [packageSpec, patchPath] of Object.entries(filteredPatches)) {
    const sourcePatchPath = path.resolve(workspaceRootDir, patchPath);

    if (!fs.existsSync(sourcePatchPath)) {
      log.warn(
        `Patch file not found: ${getRootRelativeLogPath(sourcePatchPath, workspaceRootDir)}`,
      );
      continue;
    }

    /**
     * pnpm 11 simplified the lockfile `patchedDependencies` format from
     * `Record<string, { path, hash }>` to `Record<string, string>` (selector to
     * hash), so the entry may be a bare hash string. See issue #201.
     */
    const originalPatchFile =
      lockfilePatchResult?.patchedDependencies?.[packageSpec];
    const hash =
      typeof originalPatchFile === "string"
        ? originalPatchFile
        : (originalPatchFile?.hash ?? "");

    if (packageManagerName === "pnpm" && !hash) {
      if (lockfilePatchResult?.readError) {
        throw new Error(
          `Could not read pnpm lockfile while resolving patch ${packageSpec}`,
          { cause: lockfilePatchResult.readError },
        );
      }

      throw new Error(`No hash found for patch ${packageSpec} in lockfile`);
    }

    copiedPatches[packageSpec] = {
      path: patchPath,
      hash,
    };
    patchFilesToCopy.push({
      packageSpec,
      sourcePath: sourcePatchPath,
      targetPath: path.join(isolateDir, patchPath),
    });
  }

  for (const patchFile of patchFilesToCopy) {
    await fs.ensureDir(path.dirname(patchFile.targetPath));
    await fs.copy(patchFile.sourcePath, patchFile.targetPath);
    log.debug(`Copied patch for ${patchFile.packageSpec}`);
  }

  if (Object.keys(copiedPatches).length > 0) {
    log.debug(`Copied ${Object.keys(copiedPatches).length} patch files`);
  }

  return copiedPatches;
}

/**
 * Read the patchedDependencies from the original lockfile to get the hashes.
 * Since the file content is the same after copying, the hash remains valid.
 *
 * The value type is `PatchFile | string` because pnpm 11 simplified the format
 * to store the bare hash string per selector, while pnpm <=10 stored a
 * `{ path, hash }` object (see issue #201). On the v9 path the string arrives
 * for a second reason as well: `@pnpm/lockfile.fs` migrates the object form to
 * a bare hash while reading, so only the v8 reader still yields an object.
 */
async function readLockfilePatchedDependencies(
  workspaceRootDir: string,
): Promise<{
  patchedDependencies?: Record<string, PatchFile | string>;
  readError?: unknown;
}> {
  const { majorVersion } = usePackageManager();
  const lockfileDir = getPnpmLockfileDir(workspaceRootDir);

  const result = await readPnpmLockfile(lockfileDir, majorVersion, {
    onFailure: "return-error",
  });

  if (result && "readError" in result) {
    return result;
  }

  return { patchedDependencies: result?.patchedDependencies };
}
