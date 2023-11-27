import assert from "node:assert";
import { pack, useLogger } from "../utils";
import { useConfig } from "./config";
import type { PackagesRegistry } from "./create-packages-registry";
import { usePackageManager } from "./detect-package-manager";

/**
 * Pack dependencies so that we extract only the files that are supposed to be
 * published by the packages.
 *
 * @returns A map of package names to the path of the packed file
 */
export async function packDependencies({
  /** All packages found in the monorepo by workspaces declaration */
  packagesRegistry,
  /** The dependencies that appear to be internal packages */
  internalPackageNames,
  /**
   * The directory where the isolated package and all its dependencies will end
   * up. This is also the directory from where the package will be deployed. By
   * default it is a subfolder in targetPackageDir called "isolate" but you can
   * configure it.
   */
  packDestinationDir,
}: {
  packagesRegistry: PackagesRegistry;
  internalPackageNames: string[];
  packDestinationDir: string;
}) {
  const config = useConfig();
  const log = useLogger();

  const packedFileByName: Record<string, string> = {};

  const { name, version } = usePackageManager();

  const versionMajor = parseInt(version.split(".")[0], 10);

  const usePnpmPack =
    !config.avoidPnpmPack && name === "pnpm" && versionMajor >= 8;

  if (usePnpmPack) {
    log.debug("Using PNPM pack instead of NPM pack");
  }

  for (const dependency of internalPackageNames) {
    const def = packagesRegistry[dependency];

    assert(dependency, `Failed to find package definition for ${dependency}`);

    const { name } = def.manifest;

    /**
     * If this dependency has already been packed, we skip it. It could happen
     * because we are packing workspace dependencies recursively.
     */
    if (packedFileByName[name]) {
      log.debug(`Skipping ${name} because it has already been packed`);
      continue;
    }

    packedFileByName[name] = await pack(
      def.absoluteDir,
      packDestinationDir,
      usePnpmPack
    );
  }

  return packedFileByName;
}
