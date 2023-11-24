import type {
  ProjectSnapshot,
  ResolvedDependencies,
} from "@pnpm/lockfile-file";
import fs from "fs-extra";
import { mapValues } from "lodash-es";
import path from "node:path";
import { createLogger } from "~/utils";
import { getConfig } from "./config";
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

export function mapImporterLinks({
  dependencies,
  devDependencies,
  ...rest
}: ProjectSnapshot): ProjectSnapshot {
  return {
    dependencies: dependencies ? mapDependenciesLinks(dependencies) : undefined,
    devDependencies: devDependencies
      ? mapDependenciesLinks(devDependencies)
      : undefined,
    ...rest,
  };
}

function mapDependenciesLinks(def: ResolvedDependencies): ResolvedDependencies {
  return mapValues(def, (version) =>
    version.startsWith("link:") ? convertVersionLink(version) : version
  );
}

function convertVersionLink(version: string) {
  const regex = /([^/]+)$/;

  const match = version.match(regex);

  if (!match) {
    throw new Error(
      `Failed to extract package folder name from link ${version}`
    );
  }

  const packageFolderName = match[1];

  return `link:./packages/${packageFolderName}`;
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
  internalPackages,
  targetPackageDir,
  targetPackageName,
}: {
  workspaceRootDir: string;
  packagesRegistry: PackagesRegistry;
  isolateDir: string;
  internalPackages: string[];
  targetPackageDir: string;
  targetPackageName: string;
}) {
  const log = createLogger(getConfig().logLevel);

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
        internalPackages,
        packagesRegistry,
      });
      break;
    }
    default:
      log.warn(`Unexpected package manager ${name}`);
  }
}
