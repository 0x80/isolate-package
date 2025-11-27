import fs from "fs-extra";
import path from "node:path";
import { useLogger } from "~/lib/logger";
import type { PackageManifest } from "~/lib/types";
import {
  getPackageName,
  getRootRelativeLogPath,
  readTypedJson,
} from "~/lib/utils";

export async function copyPatches({
  workspaceRootDir,
  targetPackageManifest,
  isolateDir,
  includePatchedDependencies,
  includeDevDependencies,
}: {
  workspaceRootDir: string;
  targetPackageManifest: PackageManifest;
  isolateDir: string;
  includePatchedDependencies: boolean;
  includeDevDependencies: boolean;
}): Promise<Record<string, string>> {
  const log = useLogger();

  if (!includePatchedDependencies) {
    log.debug("Skipping patch copying (includePatchedDependencies is false)");
    return {};
  }

  let workspaceRootManifest: PackageManifest;
  try {
    workspaceRootManifest = await readTypedJson<PackageManifest>(
      path.join(workspaceRootDir, "package.json")
    );
  } catch (error) {
    log.warn(
      `Could not read workspace root package.json: ${error instanceof Error ? error.message : String(error)}`
    );
    return {};
  }

  const patchedDependencies = workspaceRootManifest.pnpm?.patchedDependencies;

  if (!patchedDependencies || Object.keys(patchedDependencies).length === 0) {
    log.debug("No patched dependencies found in workspace root package.json");
    return {};
  }

  const patchesDir = path.join(isolateDir, "patches");
  await fs.ensureDir(patchesDir);

  log.debug(
    `Found ${Object.keys(patchedDependencies).length} patched dependencies in workspace`
  );

  const filteredPatches = Object.entries(patchedDependencies).filter(
    ([packageSpec]) => {
      const packageName = getPackageName(packageSpec);

      /** Check if it's a production dependency */
      if (targetPackageManifest.dependencies?.[packageName]) {
        log.debug(`Including production dependency patch: ${packageSpec}`);
        return true;
      }

      /** Check if it's a dev dependency and we should include dev dependencies */
      if (targetPackageManifest.devDependencies?.[packageName]) {
        if (includeDevDependencies) {
          log.debug(`Including dev dependency patch: ${packageSpec}`);
          return true;
        }
        log.debug(
          `Excluding dev dependency patch: ${packageSpec} (includeDevDependencies=false)`
        );
        return false;
      }

      log.debug(
        `Excluding patch ${packageSpec}: package "${packageName}" not found in target dependencies`
      );
      return false;
    }
  );

  log.debug(
    `Copying ${filteredPatches.length} patches (filtered from ${Object.keys(patchedDependencies).length})`
  );

  const copiedPatches: Record<string, string> = {};

  for (const [packageSpec, patchPath] of filteredPatches) {
    const sourcePatchPath = path.resolve(workspaceRootDir, patchPath);
    const targetPatchPath = path.join(patchesDir, path.basename(patchPath));

    if (!fs.existsSync(sourcePatchPath)) {
      log.warn(
        `Patch file not found: ${getRootRelativeLogPath(sourcePatchPath, workspaceRootDir)}`
      );
      continue;
    }

    await fs.copy(sourcePatchPath, targetPatchPath);
    log.debug(`Copied patch for ${packageSpec}: ${path.basename(patchPath)}`);

    copiedPatches[packageSpec] = `patches/${path.basename(patchPath)}`;
  }

  if (Object.keys(copiedPatches).length > 0) {
    log.debug(
      `Patches copied to ${getRootRelativeLogPath(patchesDir, isolateDir)}`
    );
  }

  return copiedPatches;
}
