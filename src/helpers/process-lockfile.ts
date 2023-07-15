import fs from "fs-extra";
import assert from "node:assert";
import path from "node:path";
import { createLogger, readTypedYamlSync, writeTypedYamlSync } from "~/utils";
import { getConfig } from "./config";
import { PackagesRegistry } from "./create-packages-registry";
import { PackageManager } from "./detect-package-manager";

type PackagePath = string;

type PnpmLockfile = {
  lockfileVersion: string;
  importers: Record<
    PackagePath,
    {
      dependencies?: Record<string, unknown>;
      devDependencies?: Record<string, unknown>;
    }
  >;
};

export function getLockfileFileName(packageManager: PackageManager) {
  switch (packageManager.name) {
    case "pnpm":
      return "pnpm-lock.yaml";
    case "yarn":
      return "yarn.lock";
    case "npm":
      return "package-lock.json";
  }
}

/**
 * Adapt the lockfile and write it to the isolate directory. Because we keep the
 * structure of packages in the isolate directory the same as they were in the
 * monorepo, the lockfile is largely still correct. The only things that need to
 * be done is to remove the root dependencies and devDependencies, and rename
 * the path to the target package to act as the new root.
 */
export function processLockfile({
  workspaceRootDir,
  targetPackageName,
  packagesRegistry,
  isolateDir,
  packageManager,
}: {
  workspaceRootDir: string;
  targetPackageName: string;
  packagesRegistry: PackagesRegistry;
  isolateDir: string;
  packageManager: PackageManager;
}) {
  const log = createLogger(getConfig().logLevel);

  const targetPackageRelativeDir =
    packagesRegistry[targetPackageName].rootRelativeDir;

  const fileName = getLockfileFileName(packageManager);

  const lockfileSrcPath = path.join(workspaceRootDir, fileName);
  const lockfileDstPath = path.join(isolateDir, fileName);

  switch (packageManager.name) {
    /**
     * It seems that for Yarn v1 and NPM v3 lockfile the content is not
     * dependent on the workspace packages structure, so I am assuming we can
     * just copy it over.
     */
    case "npm":
    case "yarn": {
      fs.copyFileSync(lockfileSrcPath, lockfileDstPath);
      log.debug("Copied lockfile to", lockfileDstPath);
      return;
    }
    case "pnpm": {
      const origLockfile = readTypedYamlSync<PnpmLockfile>(lockfileSrcPath);

      log.debug("Read PNPM lockfile, version:", origLockfile.lockfileVersion);

      const adaptedLockfile = structuredClone(origLockfile);

      const targetPackageDef =
        adaptedLockfile.importers[targetPackageRelativeDir];

      assert(
        targetPackageDef,
        `Failed to find target package in lockfile at importers[${targetPackageRelativeDir}]`
      );
      /**
       * Overwrite the root importer with the target package importer contents
       */
      adaptedLockfile.importers["."] = targetPackageDef;

      /**
       * Delete the target package original importer. Not really necessary.
       */
      delete adaptedLockfile.importers[targetPackageRelativeDir];

      writeTypedYamlSync(lockfileDstPath, adaptedLockfile);

      log.debug("Stored adapted lockfile at", lockfileDstPath);

      return;
    }

    // case "npm": {
    //   /**
    //    * Assuming a v3 lockfile.
    //    */
    //   const origLockfile = readTypedJsonSync<NpmLockfile_v3>(lockfileSrcPath);

    //   /**
    //    * Overwrite the root importer with the target package importer contents
    //    */
    //   const adaptedLockfile = structuredClone(origLockfile);

    //   const targetPackageDef =
    //     adaptedLockfile.packages[targetPackageRelativeDir];

    //   assert(
    //     targetPackageDef,
    //     `Failed to find target package in lockfile at packages[${targetPackageRelativeDir}]`
    //   );

    //   /**
    //    * The root in the NPM lockfile seems to be marked by an empty string
    //    */
    //   adaptedLockfile.packages[""] = targetPackageDef;

    //   /**
    //    * Delete the target package original importer. Not really necessary.
    //    */
    //   delete adaptedLockfile.packages[targetPackageRelativeDir];

    //   writeTypedYamlSync(lockfileDstPath, adaptedLockfile);

    //   log.debug("Stored adapted lockfile at", lockfileDstPath);
    // }
  }
}
