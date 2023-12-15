import fs from "fs-extra";
import { globSync } from "glob";
import path from "node:path";
import { useLogger } from "../logger";
import type { PackageManifest, PackagesRegistry } from "../types";
import { readTypedJson } from "../utils";
import { findPackagesGlobs } from "./helpers/find-packages-globs";

/**
 * Build a list of all packages in the workspace, depending on the package
 * manager used, with a possible override from the config file. The list
 * contains the manifest with some directory info mapped by module name.
 */
export async function createPackagesRegistry(
  workspaceRootDir: string,
  workspacePackagesOverride: string[] | undefined
): Promise<PackagesRegistry> {
  const log = useLogger();

  if (workspacePackagesOverride) {
    log.debug(
      `Override workspace packages via config: ${workspacePackagesOverride}`
    );
  }

  const packagesGlobs =
    workspacePackagesOverride ?? findPackagesGlobs(workspaceRootDir);

  const cwd = process.cwd();
  process.chdir(workspaceRootDir);

  const allPackages = packagesGlobs
    .flatMap((glob) => globSync(glob))
    /** Make sure to filter any loose files that might hang around. */
    .filter((dir) => fs.lstatSync(dir).isDirectory());

  const registry: PackagesRegistry = (
    await Promise.all(
      allPackages.map(async (rootRelativeDir) => {
        const manifestPath = path.join(rootRelativeDir, "package.json");

        if (!fs.existsSync(manifestPath)) {
          log.warn(
            `Ignoring directory ./${rootRelativeDir} because it does not contain a package.json file`
          );
          return;
        } else {
          log.debug(`Registering package ./${rootRelativeDir}`);

          const manifest = await readTypedJson<PackageManifest>(
            path.join(rootRelativeDir, "package.json")
          );

          return {
            manifest,
            rootRelativeDir,
            absoluteDir: path.join(workspaceRootDir, rootRelativeDir),
          };
        }
      })
    )
  ).reduce<PackagesRegistry>((acc, info) => {
    if (info) {
      acc[info.manifest.name] = info;
    }
    return acc;
  }, {});

  process.chdir(cwd);

  return registry;
}
