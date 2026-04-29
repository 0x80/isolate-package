import fs from "fs-extra";
import path from "node:path";
import { readWantedLockfile as readWantedLockfile_v8 } from "pnpm_lockfile_file_v8";
import { readWantedLockfile as readWantedLockfile_v9 } from "pnpm_lockfile_file_v9";
import { useLogger } from "~/lib/logger";
import { usePackageManager } from "~/lib/package-manager";
import { collectReachablePackageNames } from "~/lib/registry";
import type {
  PackageManifest,
  PackagesRegistry,
  PatchFile,
  PnpmSettings,
} from "~/lib/types";
import {
  filterPatchedDependencies,
  getRootRelativeLogPath,
  isRushWorkspace,
  readTypedJson,
  readTypedYamlSync,
} from "~/lib/utils";

export async function copyPatches({
  workspaceRootDir,
  targetPackageManifest,
  packagesRegistry,
  isolateDir,
  includeDevDependencies,
}: {
  workspaceRootDir: string;
  targetPackageManifest: PackageManifest;
  packagesRegistry: PackagesRegistry;
  isolateDir: string;
  includeDevDependencies: boolean;
}): Promise<{
  copiedPatches: Record<string, PatchFile>;
  excludedPatches: Record<string, PatchFile>;
}> {
  const log = useLogger();

  const { name: packageManagerName } = usePackageManager();

  let patchedDependencies: Record<string, string> | undefined;

  /**
   * Only try reading pnpm-workspace.yaml for pnpm workspaces. Bun workspaces
   * don't have this file and the warning would be noisy.
   */
  if (packageManagerName === "pnpm") {
    try {
      const pnpmSettings = readTypedYamlSync<PnpmSettings>(
        path.join(workspaceRootDir, "pnpm-workspace.yaml"),
      );
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
      const workspaceRootManifest = await readTypedJson<PackageManifest>(
        path.join(workspaceRootDir, "package.json"),
      );
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
    return {
      copiedPatches: {},
      excludedPatches: {},
    };
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

  const filteredPatches = filterPatchedDependencies({
    patchedDependencies,
    targetPackageManifest,
    includeDevDependencies,
    reachableDependencyNames,
  });

  /**
   * Read the pnpm lockfile to get patch hashes. Bun doesn't store hashes in
   * its lockfile so we skip this for Bun.
   */
  const lockfilePatchedDependencies =
    packageManagerName === "pnpm"
      ? await readLockfilePatchedDependencies(workspaceRootDir)
      : undefined;

  const patches: {
    copiedPatches: Record<string, PatchFile>;
    excludedPatches: Record<string, PatchFile>;
  } = {
    copiedPatches: {},
    excludedPatches: {},
  };

  for (const [packageSpec, patchPath] of Object.entries(patchedDependencies)) {
    const sourcePatchPath = path.resolve(workspaceRootDir, patchPath);

    if (!fs.existsSync(sourcePatchPath)) {
      log.warn(
        `Patch file not found: ${getRootRelativeLogPath(sourcePatchPath, workspaceRootDir)}`,
      );
      continue;
    }

    /** Preserve original folder structure */
    const targetPatchPath = path.join(isolateDir, patchPath);
    await fs.ensureDir(path.dirname(targetPatchPath));
    await fs.copy(sourcePatchPath, targetPatchPath);
    log.debug(`Copied patch for ${packageSpec}: ${patchPath}`);

    /** Get the hash from the original lockfile, or use empty string if not found */
    const originalPatchFile = lockfilePatchedDependencies?.[packageSpec];
    const hash = originalPatchFile?.hash ?? "";

    if (packageManagerName === "pnpm" && !hash) {
      log.warn(`No hash found for patch ${packageSpec} in lockfile`);
    }

    if (filteredPatches?.[packageSpec]) {
      patches.copiedPatches[packageSpec] = {
        path: patchPath,
        hash,
      };
    } else {
      patches.excludedPatches[packageSpec] = {
        path: patchPath,
        hash,
      };
    }
  }

  if (Object.keys(patches.copiedPatches).length > 0) {
    log.debug(
      `Copied ${Object.keys(patches.copiedPatches).length} patch files`,
    );
  }

  return patches;
}

/**
 * Read the patchedDependencies from the original lockfile to get the hashes.
 * Since the file content is the same after copying, the hash remains valid.
 */
async function readLockfilePatchedDependencies(
  workspaceRootDir: string,
): Promise<Record<string, PatchFile> | undefined> {
  try {
    const { majorVersion } = usePackageManager();
    const useVersion9 = majorVersion >= 9;
    const isRush = isRushWorkspace(workspaceRootDir);

    const lockfileDir = isRush
      ? path.join(workspaceRootDir, "common/config/rush")
      : workspaceRootDir;

    const lockfile = useVersion9
      ? await readWantedLockfile_v9(lockfileDir, { ignoreIncompatible: false })
      : await readWantedLockfile_v8(lockfileDir, { ignoreIncompatible: false });

    return lockfile?.patchedDependencies;
  } catch {
    /** Package manager not detected or lockfile not readable */
    return undefined;
  }
}
