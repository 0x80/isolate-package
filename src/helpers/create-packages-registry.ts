import { globSync } from "glob";
import { set } from "lodash-es";
import path from "node:path";
import { createLogger, readTypedJson } from "~/utils";
import { getConfig } from "./config";
import { findPackagesGlobs } from "./find-packages-globs";

export type PackageManifestMinimum = {
  name: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  main: string;
  module?: string;
  exports?: Record<string, { require: string; import: string }>;
  files: string[];
  version?: string;
  typings?: string;
  scripts?: Record<string, string>;
};

export type WorkspacePackageInfo = {
  absoluteDir: string;
  /**
   * The path of the package relative to the workspace root. This is the path
   * referenced in the lock file.
   */
  rootRelativeDir: string;
  /**
   * The package.json file contents
   */
  manifest: PackageManifestMinimum;
};

export type PackagesRegistry = Record<string, WorkspacePackageInfo>;

/**
 * Build a list of all packages in the workspace, depending on the package
 * manager used, with a possible override from the config file. The list contains
 * the manifest with some directory info mapped by module name.
 */
export async function createPackagesRegistry(
  workspaceRootDir: string,
  workspacePackagesOverride: string[] | undefined,
): Promise<PackagesRegistry> {
  const log = createLogger(getConfig().logLevel);

  if (workspacePackagesOverride) {
    log.debug(
      `Override workspace packages via config: ${workspacePackagesOverride}`,
    );
  }

  const packagesGlobs =
    workspacePackagesOverride ?? findPackagesGlobs(workspaceRootDir);

  const cwd = process.cwd();
  process.chdir(workspaceRootDir);

  const allPackages = packagesGlobs.flatMap((glob) => globSync(glob));

  const registry: PackagesRegistry = (
    await Promise.all(
      allPackages.map(async (rootRelativeDir) => {
        log.debug(`Registering package ${rootRelativeDir}`);
        const manifest = await readTypedJson<PackageManifestMinimum>(
          path.join(rootRelativeDir, "package.json"),
        );

        return {
          manifest,
          rootRelativeDir,
          absoluteDir: path.join(workspaceRootDir, rootRelativeDir),
        };
      }),
    )
  ).reduce<PackagesRegistry>(
    (acc, info) => set(acc, info.manifest.name, info),
    {},
  );

  process.chdir(cwd);

  return registry;
}
