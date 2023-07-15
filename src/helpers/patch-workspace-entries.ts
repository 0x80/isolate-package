import path from "node:path";
import { createLogger } from "~/utils";
import { getConfig } from "./config";
import { PackagesRegistry } from "./create-packages-registry";

export function patchWorkspaceEntries(
  dependencies: Record<string, string>,
  packagesRegistry: PackagesRegistry,
  parentRootRelativeDir?: string
) {
  const log = createLogger(getConfig().logLevel);
  const allWorkspacePackageNames = Object.keys(packagesRegistry);

  return Object.fromEntries(
    Object.entries(dependencies).map(([key, value]) => {
      if (allWorkspacePackageNames.includes(key)) {
        const def = packagesRegistry[key];

        /**
         * Some package managers seem to want a relative file:// link path when
         * referring to own dependencies. Others want the absolute path (?).
         */
        const relativePath = parentRootRelativeDir
          ? path.relative(parentRootRelativeDir, def.rootRelativeDir)
          : def.rootRelativeDir;

        // const linkedPath = `file:${
        //   isPackageToIsolate || packageManager === "npm"
        //     ? def.rootRelativeDir
        //     : relativePath
        // }`;

        // const linkPath = `file:${def.rootRelativeDir}`;
        const linkPath = `file:${relativePath}`;
        /**
         * The rootRelativeDir is the package location in the monorepo. In the
         * isolate folder we keep the same structure so we can use the same
         * relative path.
         */
        log.debug(`Linking dependency ${key} to ${linkPath}`);

        return [key, linkPath];
      } else {
        return [key, value];
      }
    })
  );
}
