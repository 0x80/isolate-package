import fs from "fs-extra";
import path from "node:path";
import { useLogger } from "#/lib/logger";
import type { PatchFile, PnpmSettings } from "#/lib/types";
import { readTypedYamlSync, writeTypedYamlSync } from "#/lib/utils";

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
 * - The source yaml cannot be read or parsed.
 * - The parsed settings have no `patchedDependencies` field and pnpm is older
 *   than version 11.
 * - Every entry in `patchedDependencies` is also present in `copiedPatches`
 *   and pnpm is older than version 11.
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

  let settings: PnpmSettings | undefined;

  try {
    settings = readTypedYamlSync(sourcePath) as PnpmSettings | undefined;
  } catch (error) {
    log.warn(
      `Could not read pnpm-workspace.yaml, falling back to verbatim copy: ${error instanceof Error ? error.message : String(error)}`,
    );
    fs.copyFileSync(sourcePath, targetPath);
    return;
  }

  if (!settings) {
    fs.copyFileSync(sourcePath, targetPath);
    return;
  }

  const needsPnpm11PatchPaths =
    majorVersion >= 11 && Object.keys(copiedPatches).length > 0;

  if (!settings.patchedDependencies && !needsPnpm11PatchPaths) {
    fs.copyFileSync(sourcePath, targetPath);
    return;
  }

  /**
   * If every patch declared in the source yaml was kept, copy verbatim so
   * comments, ordering, and trailing whitespace are preserved.
   */
  const sourceSpecs = Object.keys(settings.patchedDependencies ?? {});
  const copiedSpecs = new Set(Object.keys(copiedPatches));
  const hasExclusions = sourceSpecs.some((spec) => !copiedSpecs.has(spec));

  if (!hasExclusions && !needsPnpm11PatchPaths) {
    fs.copyFileSync(sourcePath, targetPath);
    return;
  }

  const filteredEntries = Object.entries(copiedPatches).map(
    ([spec, patchFile]) => [spec, patchFile.path] as const,
  );

  if (filteredEntries.length > 0) {
    settings.patchedDependencies = Object.fromEntries(filteredEntries);
  } else {
    delete settings.patchedDependencies;
  }

  writeTypedYamlSync(targetPath, settings);
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

  if (majorVersion >= 11 && Object.keys(copiedPatches).length > 0) {
    settings.patchedDependencies = Object.fromEntries(
      Object.entries(copiedPatches).map(([spec, patchFile]) => [
        spec,
        patchFile.path,
      ]),
    );
  }

  writeTypedYamlSync(path.join(isolateDir, "pnpm-workspace.yaml"), settings);
}
