import type { ProjectManifest } from "@pnpm/types";
import path from "path";
import type { PackageManifest } from "~/lib/types";
import { isRushWorkspace, readTypedJson } from "~/lib/utils";

/**
 * Adopts the `pnpm` fields from the root package manifest. Currently it takes
 * overrides, onlyBuiltDependencies, and ignoredBuiltDependencies, because these
 * are typically workspace-level configuration settings.
 */
export async function adoptPnpmFieldsFromRoot(
  targetPackageManifest: PackageManifest,
  workspaceRootDir: string
): Promise<PackageManifest> {
  if (isRushWorkspace(workspaceRootDir)) {
    return targetPackageManifest;
  }

  const rootPackageManifest = await readTypedJson<ProjectManifest>(
    path.join(workspaceRootDir, "package.json")
  );

  const { overrides, onlyBuiltDependencies, ignoredBuiltDependencies } =
    rootPackageManifest.pnpm || {};

  /** If no pnpm fields are present, return the original manifest */
  if (!overrides && !onlyBuiltDependencies && !ignoredBuiltDependencies) {
    return targetPackageManifest;
  }

  const pnpmConfig: Record<string, any> = {};

  if (overrides) {
    pnpmConfig.overrides = overrides;
  }

  if (onlyBuiltDependencies) {
    pnpmConfig.onlyBuiltDependencies = onlyBuiltDependencies;
  }

  if (ignoredBuiltDependencies) {
    pnpmConfig.ignoredBuiltDependencies = ignoredBuiltDependencies;
  }

  return {
    ...targetPackageManifest,
    pnpm: pnpmConfig,
  } as PackageManifest;
}
