import fs from "fs-extra";
import path from "node:path";
import { readWantedLockfile as readWantedLockfile_v8 } from "pnpm_lockfile_file_v8";
import { readWantedLockfile as readWantedLockfile_v9 } from "pnpm_lockfile_file_v9";
import { useLogger } from "~/lib/logger";
import { usePackageManager } from "~/lib/package-manager";
import type { PackageManifest, PatchFile } from "~/lib/types";
import {
  filterPatchedDependencies,
  getRootRelativeLogPath,
  isRushWorkspace,
  readTypedJson,
} from "~/lib/utils";

export async function copyPatches({
  workspaceRootDir,
  targetPackageManifest,
  isolateDir,
  includeDevDependencies,
}: {
  workspaceRootDir: string;
  targetPackageManifest: PackageManifest;
  isolateDir: string;
  includeDevDependencies: boolean;
}): Promise<Record<string, PatchFile>> {
  const log = useLogger();

  let workspaceRootManifest: PackageManifest;
  try {
    workspaceRootManifest = await readTypedJson<PackageManifest>(
      path.join(workspaceRootDir, "package.json"),
    );
  } catch (error) {
    log.warn(
      `Could not read workspace root package.json: ${error instanceof Error ? error.message : String(error)}`,
    );
    return {};
  }

  /** PNPM stores patches under pnpm.patchedDependencies, Bun at the top level */
  const patchedDependencies =
    workspaceRootManifest.pnpm?.patchedDependencies ??
    workspaceRootManifest.patchedDependencies;

  if (!patchedDependencies || Object.keys(patchedDependencies).length === 0) {
    log.debug("No patched dependencies found in workspace root package.json");
    return {};
  }

  log.debug(
    `Found ${Object.keys(patchedDependencies).length} patched dependencies in workspace`,
  );

  const filteredPatches = filterPatchedDependencies({
    patchedDependencies,
    targetPackageManifest,
    includeDevDependencies,
  });

  if (!filteredPatches) {
    return {};
  }

  /**
   * Read the pnpm lockfile to get patch hashes. Bun doesn't store hashes in
   * its lockfile so we skip this for Bun.
   */
  const { name: packageManagerName } = usePackageManager();
  const lockfilePatchedDependencies =
    packageManagerName === "pnpm"
      ? await readLockfilePatchedDependencies(workspaceRootDir)
      : undefined;

  const copiedPatches: Record<string, PatchFile> = {};

  for (const [packageSpec, patchPath] of Object.entries(filteredPatches)) {
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

    copiedPatches[packageSpec] = {
      path: patchPath,
      hash,
    };
  }

  if (Object.keys(copiedPatches).length > 0) {
    log.debug(`Copied ${Object.keys(copiedPatches).length} patch files`);
  }

  return copiedPatches;
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
