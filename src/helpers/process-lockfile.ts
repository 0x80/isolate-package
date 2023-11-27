import type {
  ProjectSnapshot,
  ResolvedDependencies,
} from "@pnpm/lockfile-file";
import fs from "fs-extra";
import path from "node:path";
import { mapObjIndexed } from "ramda";
import { useLogger } from "../utils";
import type { PackagesRegistry } from "./create-packages-registry";
import type { PackageManagerName } from "./detect-package-manager";
import { usePackageManager } from "./detect-package-manager";
import { generateNpmLockfile } from "./generate-npm-lockfile";
import { generatePnpmLockfile } from "./generate-pnpm-lockfile";

export function getLockfileFileName(name: PackageManagerName) {
  switch (name) {
    case "pnpm":
      return "pnpm-lock.yaml";
    case "yarn":
      return "yarn.lock";
    case "npm":
      return "package-lock.json";
  }
}

/** Convert dependency links */
export function pnpmMapImporter(
  { dependencies, devDependencies, ...rest }: ProjectSnapshot,
  {
    includeDevDependencies,
    directoryByPackageName,
  }: {
    includeDevDependencies: boolean;
    directoryByPackageName: { [packageName: string]: string };
  }
): ProjectSnapshot {
  return {
    dependencies: dependencies
      ? pnpmMapDependenciesLinks(dependencies, directoryByPackageName)
      : undefined,
    devDependencies:
      includeDevDependencies && devDependencies
        ? pnpmMapDependenciesLinks(devDependencies, directoryByPackageName)
        : undefined,
    ...rest,
  };
}

function pnpmMapDependenciesLinks(
  def: ResolvedDependencies,
  directoryByPackageName: { [packageName: string]: string }
): ResolvedDependencies {
  return mapObjIndexed(
    (version, name) =>
      version.startsWith("link:")
        ? `link:./${directoryByPackageName[name]}`
        : version,
    def
  );
}

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
  targetPackageName,
}: {
  workspaceRootDir: string;
  packagesRegistry: PackagesRegistry;
  isolateDir: string;
  internalDepPackageNames: string[];
  targetPackageDir: string;
  targetPackageName: string;
}) {
  const log = useLogger();

  const { name } = usePackageManager();

  const fileName = getLockfileFileName(name);

  const lockfileSrcPath = path.join(workspaceRootDir, fileName);
  const lockfileDstPath = path.join(isolateDir, fileName);

  switch (name) {
    case "npm": {
      /** If there is a shrinkwrap file we copy that instead of the lockfile */
      const shrinkwrapSrcPath = path.join(
        workspaceRootDir,
        "npm-shrinkwrap.json"
      );
      const shrinkwrapDstPath = path.join(isolateDir, "npm-shrinkwrap.json");

      if (fs.existsSync(shrinkwrapSrcPath)) {
        fs.copyFileSync(shrinkwrapSrcPath, shrinkwrapDstPath);
        log.debug("Copied shrinkwrap to", shrinkwrapDstPath);
      } else {
        fs.copyFileSync(lockfileSrcPath, lockfileDstPath);
        log.debug("Copied lockfile to", lockfileDstPath);
      }

      if (false) {
        /** Generate the lockfile */
        await generateNpmLockfile({
          workspaceRootDir,
          targetPackageName,
          isolateDir,
          packagesRegistry,
        });
      }

      break;
    }
    case "yarn": {
      fs.copyFileSync(lockfileSrcPath, lockfileDstPath);
      log.debug("Copied lockfile to", lockfileDstPath);
      break;
    }
    case "pnpm": {
      await generatePnpmLockfile({
        workspaceRootDir,
        targetPackageDir,
        isolateDir,
        internalDepPackageNames,
        packagesRegistry,
      });
      break;
    }
    default:
      log.warn(`Unexpected package manager ${name}`);
  }
}
