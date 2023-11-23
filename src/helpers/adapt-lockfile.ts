import fs from "fs-extra";
import { omit } from "lodash-es";
import assert from "node:assert";
import path from "node:path";
import { createLogger, readTypedYamlSync, writeTypedYamlSync } from "~/utils";
import { getConfig } from "./config";
import { PackagesRegistry } from "./create-packages-registry";
import {
  PackageManagerName,
  usePackageManager,
} from "./detect-package-manager";

type PnpmLockfile = {
  lockfileVersion: string;
  importers: { [packagePath: string]: PnpmImporterDef };
};

type PnpmImporterDef = {
  dependencies?: PnpmDependenciesDef;
  devDependencies?: PnpmDependenciesDef;
};

type PnpmDependenciesDef = {
  [packageName: string]: {
    specifier: string;
    version: string;
  };
};

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

/**
 * Adapt the lockfile and write it to the isolate directory. Because we keep the
 * structure of packages in the isolate directory the same as they were in the
 * monorepo, the lockfile is largely still correct. The only things that need to
 * be done is to remove the root dependencies and devDependencies, and rename
 * the path to the target package to act as the new root.
 */
export function adaptLockfile({
  workspaceRootDir,
  targetPackageName,
  packagesRegistry,
  isolateDir,
}: {
  workspaceRootDir: string;
  targetPackageName: string;
  packagesRegistry: PackagesRegistry;
  isolateDir: string;
}) {
  const log = createLogger(getConfig().logLevel);

  console.log("+++ adaptLockfile");

  const targetPackageRelativeDir =
    packagesRegistry[targetPackageName].rootRelativeDir;

  const { name } = usePackageManager();

  const fileName = getLockfileFileName(name);

  const lockfileSrcPath = path.join(workspaceRootDir, fileName);
  const lockfileDstPath = path.join(isolateDir, fileName);

  switch (name) {
    case "npm": {
      /**
       * If there is a shrinkwrap file we copy that instead of the lockfile
       */
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

      return;
    }
    case "yarn": {
      fs.copyFileSync(lockfileSrcPath, lockfileDstPath);
      log.debug("Copied lockfile to", lockfileDstPath);
      return;
    }
    case "pnpm": {
      const origLockfile = readTypedYamlSync<PnpmLockfile>(lockfileSrcPath);

      log.debug("Read PNPM lockfile, version:", origLockfile.lockfileVersion);

      const { importers: origImporters, ...rest } = origLockfile;

      const movedImporters = moveImportersTargetPackageDef(
        origImporters,
        targetPackageRelativeDir
      );

      const mappedImporters = mapImportersLinks(
        movedImporters,
        getConfig().includeDevDependencies
      );

      writeTypedYamlSync(lockfileDstPath, {
        importers: mappedImporters,
        ...rest,
      });

      log.debug("Stored adapted lockfile at", lockfileDstPath);

      return;
    }
  }
}

function moveImportersTargetPackageDef(
  importers: PnpmLockfile["importers"],
  targetPackageRelativeDir: string
): PnpmLockfile["importers"] {
  const targetPackageDef = importers[targetPackageRelativeDir];

  assert(
    targetPackageDef,
    `Failed to find target package in lockfile at importers[${targetPackageRelativeDir}]`
  );

  /**
   * Overwrite the root "."importer with the target package importer contents,
   * and omit the original target package importer (not strictly necessary).
   */

  return omit({ ...importers, ["."]: targetPackageDef }, [
    targetPackageRelativeDir,
  ]);
}

function mapImportersLinks(
  importers: PnpmLockfile["importers"],
  includeDevDependencies = false
): PnpmLockfile["importers"] {
  return Object.fromEntries(
    Object.entries(importers).map(
      ([importerPath, { dependencies, devDependencies }]) => {
        return [
          importerPath,
          {
            dependencies: dependencies
              ? mapDependenciesLinks(dependencies)
              : undefined,
            devDependencies:
              includeDevDependencies && devDependencies
                ? mapDependenciesLinks(devDependencies)
                : undefined,
          },
        ];
      }
    )
  );
}

function mapDependenciesLinks(def: PnpmDependenciesDef): PnpmDependenciesDef {
  return Object.fromEntries(
    Object.entries(def).map(([packageName, def]) => {
      if (def.version.startsWith("link:")) {
        return [packageName, convertVersionLink(def)];
      } else {
        return [packageName, def];
      }
    })
  );
}

function convertVersionLink(def: PnpmDependenciesDef["string"]) {
  const regex = /([^/]+)$/;

  const match = def.version.match(regex);

  if (!match) {
    throw new Error(
      `Failed to extract package folder name from ${def.version}`
    );
  }

  const packageFolderName = match[1];

  return {
    ...def,
    version: `./packages/${packageFolderName}`,
  };
}
