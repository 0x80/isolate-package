import fs from "fs-extra";
import path from "node:path";
import { useLogger } from "#/lib/logger";
import type { PatchFile, PnpmSettings } from "#/lib/types";
import { readTypedYamlSync, writeTypedYamlSync } from "#/lib/utils";
import { getPnpmPatchedDependenciesOutput } from "./pnpm-patched-dependencies";

type GeneratedPnpmWorkspaceSettings = PnpmSettings & {
  packages: string[];
};

/**
 * Copy `pnpm-workspace.yaml` from the workspace root to the isolate directory,
 * filtering its `patchedDependencies` field so it only references patches that
 * were actually copied to the isolate. Without this, `pnpm install` in the
 * isolate fails when patches that don't apply to the target package are
 * declared in the workspace root config (see issue #178).
 *
 * The yaml is rewritten when filtering changes patch entries or when pnpm 11
 * and later need copied patch paths. Otherwise, it is copied verbatim to
 * preserve comments, key order, and trailing whitespace.
 *
 * - The source yaml cannot be read or parsed and pnpm does not need a
 *   `patchedDependencies` field. pnpm 11 and later instead fail clearly when
 *   copied patches require adapted paths in that file.
 * - The parsed settings have no `patchedDependencies` field and pnpm does not
 *   need workspace patch paths.
 * - Every entry in `patchedDependencies` is also present in `copiedPatches`
 *   and pnpm does not need workspace patch paths.
 *
 * Otherwise, `patchedDependencies` is rewritten to the entries in
 * `copiedPatches` (or removed entirely when none remain). pnpm 11 and later
 * always use this field for copied patches because their lockfile stores only
 * the patch hash.
 */
export function writeIsolatePnpmWorkspace({
  workspaceRootDir,
  isolateDir,
  majorVersion,
  copiedPatches,
}: {
  workspaceRootDir: string;
  isolateDir: string;
  majorVersion: number;
  copiedPatches: Record<string, PatchFile>;
}) {
  const log = useLogger();
  const sourcePath = path.join(workspaceRootDir, "pnpm-workspace.yaml");
  const targetPath = path.join(isolateDir, "pnpm-workspace.yaml");

  let settings: unknown;
  const patchOutput = getPnpmPatchedDependenciesOutput({
    majorVersion,
    copiedPatches,
  });
  const workspacePatchPaths = patchOutput.workspace;

  try {
    settings = readTypedYamlSync(sourcePath);
  } catch (error) {
    if (workspacePatchPaths) {
      throw new Error(
        "Cannot write pnpm patch paths without readable workspace settings",
        { cause: error },
      );
    }

    log.warn(
      `Could not read pnpm-workspace.yaml, falling back to verbatim copy: ${error instanceof Error ? error.message : String(error)}`,
    );
    fs.copyFileSync(sourcePath, targetPath);
    return;
  }

  if (!isPnpmWorkspaceSettings(settings)) {
    if (workspacePatchPaths) {
      throw new Error(
        "Cannot write pnpm patch paths without readable workspace settings",
      );
    }

    fs.copyFileSync(sourcePath, targetPath);
    return;
  }

  if (!settings.patchedDependencies && !workspacePatchPaths) {
    fs.copyFileSync(sourcePath, targetPath);
    return;
  }

  /**
   * If every patch declared in the source yaml was kept and pnpm does not
   * need workspace patch paths, copy verbatim to preserve comments, ordering,
   * and trailing whitespace.
   */
  const sourceSpecs = Object.keys(settings.patchedDependencies ?? {});
  const copiedSpecs = new Set(Object.keys(copiedPatches));
  const hasExclusions = sourceSpecs.some((spec) => !copiedSpecs.has(spec));

  if (!hasExclusions && !workspacePatchPaths) {
    fs.copyFileSync(sourcePath, targetPath);
    return;
  }

  const patchPaths = patchOutput.workspace ?? patchOutput.manifest ?? {};
  const filteredEntries = Object.entries(patchPaths);

  if (filteredEntries.length > 0) {
    settings.patchedDependencies = Object.fromEntries(filteredEntries);
  } else {
    delete settings.patchedDependencies;
  }

  writeTypedYamlSync(targetPath, settings);
}

/** Narrow parsed YAML to a mapping that can hold pnpm workspace settings. */
function isPnpmWorkspaceSettings(settings: unknown): settings is PnpmSettings {
  return (
    typeof settings === "object" &&
    settings !== null &&
    !Array.isArray(settings)
  );
}

/** Write the workspace configuration generated for a Rush isolate. */
export function writeGeneratedIsolatePnpmWorkspace({
  isolateDir,
  packages,
  majorVersion,
  copiedPatches,
}: {
  isolateDir: string;
  packages: string[];
  majorVersion: number;
  copiedPatches: Record<string, PatchFile>;
}) {
  const settings: GeneratedPnpmWorkspaceSettings = { packages };
  const patchOutput = getPnpmPatchedDependenciesOutput({
    majorVersion,
    copiedPatches,
  });

  if (patchOutput.workspace) {
    settings.patchedDependencies = patchOutput.workspace;
  }

  writeTypedYamlSync(path.join(isolateDir, "pnpm-workspace.yaml"), settings);
}
