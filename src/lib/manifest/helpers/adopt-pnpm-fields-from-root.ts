import type { ProjectManifest } from "@pnpm/types";
import path from "path";
import type { PackageManifest } from "~/lib/types";
import { isRushWorkspace, readTypedJson } from "~/lib/utils";

/**
 * Adopts the `pnpm` fields from the root package manifest. Currently it only
 * takes overrides, because I don't know if any of the others are useful or
 * desired.
 */
export async function adoptPnpmFieldsFromRoot(
  targetPackageManifest: PackageManifest,
  workspaceRootDir: string
) {
  if (isRushWorkspace(workspaceRootDir)) {
    return targetPackageManifest;
  }

  const rootPackageManifest = await readTypedJson<ProjectManifest>(
    path.join(workspaceRootDir, "package.json")
  );

  const overrides = rootPackageManifest.pnpm?.overrides;

  if (!overrides) {
    return targetPackageManifest;
  }

  return {
    ...targetPackageManifest,
    pnpm: {
      overrides,
    },
  };
}
