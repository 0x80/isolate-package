import type { PatchFile } from "#/lib/types";

type PnpmPatchedDependenciesOutput = {
  lockfile?: Record<string, PatchFile | string>;
  manifest?: Record<string, string>;
  workspace?: Record<string, string>;
};

/** Return whether this pnpm version writes patch paths in pnpm-workspace.yaml. */
export function usesPnpmWorkspacePatchedDependencies(majorVersion: number) {
  return Number.isFinite(majorVersion) && majorVersion >= 11;
}

/** Extract copied patch paths for package-manager configuration. */
export function getPnpmPatchedDependencyPaths(
  copiedPatches: Record<string, PatchFile>,
) {
  return Object.fromEntries(
    Object.entries(copiedPatches).map(([spec, patchFile]) => [
      spec,
      patchFile.path,
    ]),
  );
}

/**
 * Convert copied patches into the representations expected by this pnpm
 * version. pnpm 11 moved patch paths from package.json and the lockfile to
 * pnpm-workspace.yaml, while retaining patch hashes in the lockfile.
 */
export function getPnpmPatchedDependenciesOutput({
  majorVersion,
  copiedPatches,
}: {
  majorVersion: number;
  copiedPatches?: Record<string, PatchFile>;
}): PnpmPatchedDependenciesOutput {
  if (!copiedPatches || Object.keys(copiedPatches).length === 0) {
    return {};
  }

  const patchPaths = getPnpmPatchedDependencyPaths(copiedPatches);

  if (usesPnpmWorkspacePatchedDependencies(majorVersion)) {
    return {
      lockfile: Object.fromEntries(
        Object.entries(copiedPatches).map(([spec, patchFile]) => [
          spec,
          patchFile.hash,
        ]),
      ),
      workspace: patchPaths,
    };
  }

  return { lockfile: copiedPatches, manifest: patchPaths };
}
