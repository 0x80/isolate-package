import type { ProjectManifest, PnpmSettings } from "@pnpm/types";
import path from "path";
import { usePackageManager } from "~/lib/package-manager";
import type { PackageManifest } from "~/lib/types";
import { isRushWorkspace, readTypedJson } from "~/lib/utils";

/**
 * Adopts workspace-level fields from the root package manifest. For pnpm this
 * reads overrides, onlyBuiltDependencies, and ignoredBuiltDependencies from the
 * `pnpm` key. For Bun it reads `overrides` from the top level.
 */
export async function adoptPnpmFieldsFromRoot(
  targetPackageManifest: PackageManifest,
  workspaceRootDir: string,
): Promise<PackageManifest> {
  if (isRushWorkspace(workspaceRootDir)) {
    return targetPackageManifest;
  }

  const rootPackageManifest = await readTypedJson<ProjectManifest>(
    path.join(workspaceRootDir, "package.json"),
  );

  const packageManager = usePackageManager();

  if (packageManager.name === "bun") {
    return adoptBunFieldsFromRoot(targetPackageManifest, rootPackageManifest);
  }

  return adoptPnpmFieldsOnly(targetPackageManifest, rootPackageManifest);
}

/** Adopt Bun's top-level overrides from the root manifest */
function adoptBunFieldsFromRoot(
  targetPackageManifest: PackageManifest,
  rootPackageManifest: ProjectManifest,
): PackageManifest {
  /**
   * Bun supports `overrides` at the top level of package.json (same as npm).
   * Read from the root manifest and set them on the output manifest so that
   * `bun install --frozen-lockfile` succeeds.
   */
  const overrides = (rootPackageManifest as Record<string, unknown>)[
    "overrides"
  ] as Record<string, string> | undefined;

  if (!overrides) {
    return targetPackageManifest;
  }

  return {
    ...targetPackageManifest,
    overrides,
  } as PackageManifest;
}

/** Adopt pnpm-specific fields from the root manifest */
function adoptPnpmFieldsOnly(
  targetPackageManifest: PackageManifest,
  rootPackageManifest: ProjectManifest,
): PackageManifest {
  const { overrides, onlyBuiltDependencies, ignoredBuiltDependencies } =
    rootPackageManifest.pnpm || {};

  /** If no pnpm fields are present, return the original manifest */
  if (!overrides && !onlyBuiltDependencies && !ignoredBuiltDependencies) {
    return targetPackageManifest;
  }

  const pnpmConfig: Partial<PnpmSettings> = {};

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
