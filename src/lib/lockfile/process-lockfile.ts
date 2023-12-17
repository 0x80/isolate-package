import type {
  ProjectSnapshot,
  ResolvedDependencies,
} from "@pnpm/lockfile-file";
import fs from "fs-extra";
import path from "node:path";
import { mapObjIndexed } from "ramda";
import semver from "semver";
import { useLogger } from "../logger";
import { getLockfileFileName, usePackageManager } from "../package-manager";
import type { PackagesRegistry } from "../types";
import { generateNpmLockfile } from "./helpers/generate-npm-lockfile";
import { generatePnpmLockfile } from "./helpers/generate-pnpm-lockfile";

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
}: {
  workspaceRootDir: string;
  packagesRegistry: PackagesRegistry;
  isolateDir: string;
  internalDepPackageNames: string[];
  targetPackageDir: string;
  targetPackageName: string;
}) {
  const log = useLogger();

  const { name, version } = usePackageManager();

  const fileName = getLockfileFileName(name);

  switch (name) {
    case "npm": {
      await generateNpmLockfile({
        workspaceRootDir,
        isolateDir,
      });

      break;
    }
    case "yarn": {
      if (semver.gt(version, "1")) {
        log.warn(
          `Only Yarn classic (v1) is currently supported. Omitting lockfile from isolate output.`
        );
        break;
      }

      const lockfileSrcPath = path.join(workspaceRootDir, fileName);
      const lockfileDstPath = path.join(isolateDir, fileName);

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
