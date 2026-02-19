import fs from "fs-extra";
import { globSync } from "glob";
import path from "node:path";
import { useLogger } from "../logger";
import type { PackageManifest, PackagesRegistry } from "../types";
import { isRushWorkspace, readTypedJson, readTypedJsonSync } from "../utils";
import { findPackagesGlobs } from "./helpers";

/**
 * Build a list of all packages in the workspace, depending on the package
 * manager used, with a possible override from the config file. The list
 * contains the manifest with some directory info mapped by module name.
 */
export async function createPackagesRegistry(
  workspaceRootDir: string,
  workspacePackagesOverride: string[] | undefined,
): Promise<PackagesRegistry> {
  const log = useLogger();

  if (workspacePackagesOverride) {
    log.debug(
      `Override workspace packages via config: ${workspacePackagesOverride.join(", ")}`,
    );
  }

  const allPackages = listWorkspacePackages(
    workspacePackagesOverride,
    workspaceRootDir,
  );

  const registry: PackagesRegistry = (
    await Promise.all(
      allPackages.map(async (rootRelativeDir) => {
        const absoluteDir = path.join(workspaceRootDir, rootRelativeDir);
        const manifestPath = path.join(absoluteDir, "package.json");

        if (!fs.existsSync(manifestPath)) {
          log.warn(
            `Ignoring directory ${rootRelativeDir} because it does not contain a package.json file`,
          );
          return;
        } else {
          log.debug(`Registering package ${rootRelativeDir}`);

          const manifest = await readTypedJson<PackageManifest>(
            path.join(absoluteDir, "package.json"),
          );

          return {
            manifest,
            rootRelativeDir,
            absoluteDir,
          };
        }
      }),
    )
  ).reduce<PackagesRegistry>((acc, info) => {
    if (info) {
      acc[info.manifest.name] = info;
    }
    return acc;
  }, {});

  return registry;
}

type RushConfig = {
  projects: { packageName: string; projectFolder: string }[];
};

function listWorkspacePackages(
  workspacePackagesOverride: string[] | undefined,
  workspaceRootDir: string,
) {
  if (isRushWorkspace(workspaceRootDir)) {
    const rushConfig = readTypedJsonSync<RushConfig>(
      path.join(workspaceRootDir, "rush.json"),
    );

    return rushConfig.projects.map(({ projectFolder }) => projectFolder);
  } else {
    const currentDir = process.cwd();
    process.chdir(workspaceRootDir);

    const packagesGlobs =
      workspacePackagesOverride ?? findPackagesGlobs(workspaceRootDir);

    const allPackages = packagesGlobs
      .flatMap((glob) => globSync(glob))
      /** Make sure to filter any loose files that might hang around. */
      .filter((dir) => fs.lstatSync(dir).isDirectory());

    process.chdir(currentDir);
    return allPackages;
  }
}
