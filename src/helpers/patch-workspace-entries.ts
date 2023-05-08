import { createLogger } from "~/utils";
import { getConfig } from "./config";
import { PackagesRegistry } from "./create-packages-registry";

export function patchWorkspaceEntries(
  dependencies: Record<string, string>,
  packagesRegistry: PackagesRegistry,
) {
  const log = createLogger(getConfig().logLevel);
  const allWorkspacePackageNames = Object.keys(packagesRegistry);

  return Object.fromEntries(
    Object.entries(dependencies).map(([key, value]) => {
      if (allWorkspacePackageNames.includes(key)) {
        const def = packagesRegistry[key];

        /**
         * The rootRelativeDir is the package location in the monorepo. In the
         * isolate folder we keep the same structure so we can use the same
         * relative path.
         */
        log.debug(`Linking dependency ${key} to file:${def.rootRelativeDir}`);

        return [key, `file:${def.rootRelativeDir}`];
      } else {
        return [key, value];
      }
    }),
  );
}
