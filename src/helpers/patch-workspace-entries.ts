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
         * When nested shared dependencies are used (local deps linking to other
         * local deps), the parentRootRelativeDir will be passed in, and we
         * store the relative path to the isolate/packages directory, as is
         * required by some package managers.
         *
         * For consistency we also write the other file paths starting with
         * ./, but it doesn't seem to be necessary for any package manager.
         */
        const relativePath = parentRootRelativeDir
          ? path.relative(parentRootRelativeDir, `./${def.rootRelativeDir}`)
          : `./${def.rootRelativeDir}`;

        const linkPath = `file:${relativePath}`;

        log.debug(`Linking dependency ${key} to ${linkPath}`);

        return [key, linkPath];
      } else {
        return [key, value];
      }
    })
  );
}
