import type { IsolateConfigResolved } from "../config";
import { useLogger } from "../logger";
import { usePackageManager } from "../package-manager";
import type { PackageManifest, PackagesRegistry, PatchFile } from "../types";
import {
  generateNpmLockfile,
  generatePnpmLockfile,
  generateYarnLockfile,
} from "./helpers";

/**
 * Adapt the lockfile and write it to the isolate directory. Because we keep the
 * structure of packages in the isolate directory the same as they were in the
 * monorepo, the lockfile is largely still correct. The only things that need to
 * be done is to remove the root dependencies and devDependencies, and rename
 * the path to the target package to act as the new root.
 */
export async function processLockfile({
  workspaceRootDir,
  packagesRegistry,
  isolateDir,
  internalDepPackageNames,
  targetPackageDir,
  targetPackageManifest,
  patchedDependencies,
  config,
}: {
  workspaceRootDir: string;
  packagesRegistry: PackagesRegistry;
  isolateDir: string;
  internalDepPackageNames: string[];
  targetPackageDir: string;
  targetPackageName: string;
  targetPackageManifest: PackageManifest;
  /** Pre-computed patched dependencies with transformed paths from copyPatches */
  patchedDependencies?: Record<string, PatchFile>;
  config: IsolateConfigResolved;
}) {
  const log = useLogger();

  if (config.forceNpm) {
    log.debug("Forcing to use NPM for isolate output");

    await generateNpmLockfile({
      workspaceRootDir,
      isolateDir,
    });

    return true;
  }

  const { name, majorVersion } = usePackageManager();
  let usedFallbackToNpm = false;

  switch (name) {
    case "npm": {
      await generateNpmLockfile({
        workspaceRootDir,
        isolateDir,
      });

      break;
    }
    case "yarn": {
      if (majorVersion === 1) {
        await generateYarnLockfile({
          workspaceRootDir,
          isolateDir,
        });
      } else {
        log.warn(
          "Detected modern version of Yarn. Using NPM lockfile fallback."
        );

        await generateNpmLockfile({
          workspaceRootDir,
          isolateDir,
        });

        usedFallbackToNpm = true;
      }

      break;
    }
    case "pnpm": {
      await generatePnpmLockfile({
        workspaceRootDir,
        targetPackageDir,
        isolateDir,
        internalDepPackageNames,
        packagesRegistry,
        targetPackageManifest,
        majorVersion,
        includeDevDependencies: config.includeDevDependencies,
        patchedDependencies,
      });
      break;
    }
    case "bun": {
      log.warn(
        `Ouput lockfiles for Bun are not yet supported. Using NPM for output`
      );
      await generateNpmLockfile({
        workspaceRootDir,
        isolateDir,
      });

      usedFallbackToNpm = true;
      break;
    }
    default:
      log.warn(
        `Unexpected package manager ${name as string}. Using NPM for output`
      );
      await generateNpmLockfile({
        workspaceRootDir,
        isolateDir,
      });

      usedFallbackToNpm = true;
  }

  return usedFallbackToNpm;
}
