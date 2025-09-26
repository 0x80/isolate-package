import fs from "fs-extra";
import path from "node:path";
import { useLogger } from "../logger";
import type { PackageManifest } from "../types";
import { getRootRelativeLogPath } from "../utils";

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

  // Read patchedDependencies from workspace root package.json, not target package
  let workspaceRootManifest: PackageManifest;
  try {
    const { readTypedJson } = await import("../utils");
    workspaceRootManifest = await readTypedJson<PackageManifest>(
      path.join(workspaceRootDir, "package.json")
    );
  } catch (error) {
    log.warn(`Could not read workspace root package.json: ${error}`);
    return {};
  }

  const patchedDependencies = workspaceRootManifest.pnpm?.patchedDependencies;

  if (!patchedDependencies || Object.keys(patchedDependencies).length === 0) {
    log.debug("No patched dependencies found in package.json");
    return {};
  }

  const patchesDir = path.join(isolateDir, "patches");
  await fs.ensureDir(patchesDir);

  log.debug(
    `Found ${Object.keys(patchedDependencies).length} patched dependencies`
  );

  // Get the package name from the package spec (e.g., "chalk@5.3.0" -> "chalk", "@firebase/app@1.2.3" -> "@firebase/app")
  const getPackageName = (packageSpec: string): string => {
    // Handle scoped packages: @scope/package@version -> @scope/package
    if (packageSpec.startsWith("@")) {
      const parts = packageSpec.split("@");
      return `@${parts[1]}`;
    }
    // Handle regular packages: package@version -> package
    return packageSpec.split("@")[0];
  };

  // Filter patches based on dependency type
  const filteredPatches = Object.entries(patchedDependencies).filter(
    ([packageSpec]) => {
      const packageName = getPackageName(packageSpec);

      // Check if it's a regular dependency
      if (targetPackageManifest.dependencies?.[packageName]) {
        log.debug(`Including production dependency patch: ${packageSpec}`);
        return true;
      }

      // Check if it's a dev dependency and we should include dev dependencies
      if (targetPackageManifest.devDependencies?.[packageName]) {
        if (includeDevDependencies) {
          log.debug(`Including dev dependency patch: ${packageSpec}`);
          return true;
        } else {
          log.debug(
            `Excluding dev dependency patch: ${packageSpec} (includeDevDependencies=false)`
          );
          return false;
        }
      }

      // Package not found in dependencies or devDependencies
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

    // Store the relative path for the isolated package.json
    copiedPatches[packageSpec] = `patches/${path.basename(patchPath)}`;
  }

  log.debug(
    `Patches copied to ${getRootRelativeLogPath(patchesDir, isolateDir)}`
  );
  return copiedPatches;
}
