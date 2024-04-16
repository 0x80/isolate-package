import { useLogger } from "../logger";
import { usePackageManager } from "../package-manager";
import type { PackageManifest, PackagesRegistry } from "../types";
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
}: {
  workspaceRootDir: string;
  packagesRegistry: PackagesRegistry;
  isolateDir: string;
  internalDepPackageNames: string[];
  targetPackageDir: string;
  targetPackageName: string;
  targetPackageManifest: PackageManifest;
}) {
  const log = useLogger();

  const { name, version } = usePackageManager();
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
      const versionMajor = parseInt(version.split(".")[0], 10);

      if (versionMajor === 1) {
        await generateYarnLockfile({
          workspaceRootDir,
          isolateDir,
        });
      } else {
        log.info(
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
      });
      break;
    }
    default:
      log.warn(`Unexpected package manager ${name}. Using NPM for output`);
      await generateNpmLockfile({
        workspaceRootDir,
        isolateDir,
      });

      usedFallbackToNpm = true;
  }

  return usedFallbackToNpm;
}
