import fs from "fs-extra";
import path from "node:path";
import { useLogger } from "~/lib/logger";
import type { PatchFile, PnpmSettings } from "~/lib/types";
import { readTypedYamlSync, writeTypedYamlSync } from "~/lib/utils";

/**
 * Copy `pnpm-workspace.yaml` from the workspace root to the isolate directory,
 * filtering its `patchedDependencies` field so it only references patches that
 * were actually copied to the isolate. Without this, `pnpm install` in the
 * isolate fails when patches that don't apply to the target package are
 * declared in the workspace root config (see issue #178).
 *
 * The yaml is only rewritten when filtering is required. The file is copied
 * verbatim — preserving comments, key order, and trailing whitespace — when
 * any of the following hold:
 *
 * - The source yaml cannot be parsed.
 * - The parsed settings have no `patchedDependencies` field.
 * - Every entry in `patchedDependencies` is also present in `copiedPatches`
 *   (no exclusions, so rewriting would only churn formatting).
 *
 * Otherwise, `patchedDependencies` is rewritten to the entries in
 * `copiedPatches` (or removed entirely when none remain).
 */
export function writeIsolatePnpmWorkspace({
  workspaceRootDir,
  isolateDir,
  copiedPatches,
}: {
  workspaceRootDir: string;
  isolateDir: string;
  copiedPatches: Record<string, PatchFile>;
}) {
  const log = useLogger();
  const sourcePath = path.join(workspaceRootDir, "pnpm-workspace.yaml");
  const targetPath = path.join(isolateDir, "pnpm-workspace.yaml");

  let settings: PnpmSettings | undefined;

  try {
    settings = readTypedYamlSync<PnpmSettings>(sourcePath);
  } catch (error) {
    log.warn(
      `Could not parse pnpm-workspace.yaml, falling back to verbatim copy: ${error instanceof Error ? error.message : String(error)}`,
    );
    fs.copyFileSync(sourcePath, targetPath);
    return;
  }

  if (!settings || !settings.patchedDependencies) {
    fs.copyFileSync(sourcePath, targetPath);
    return;
  }

  /**
   * If every patch declared in the source yaml was kept, copy verbatim so
   * comments, ordering, and trailing whitespace are preserved.
   */
  const sourceSpecs = Object.keys(settings.patchedDependencies);
  const copiedSpecs = new Set(Object.keys(copiedPatches));
  const hasExclusions = sourceSpecs.some((spec) => !copiedSpecs.has(spec));

  if (!hasExclusions) {
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
