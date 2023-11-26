import path from "node:path";
import { useLogger } from "~/utils";
import type { PackagesRegistry } from "./create-packages-registry";

export function patchInternalEntries(
  dependencies: Record<string, string>,
  packagesRegistry: PackagesRegistry,
  parentRootRelativeDir?: string
) {
  const log = useLogger();
  const allWorkspacePackageNames = Object.keys(packagesRegistry);

  return Object.fromEntries(
    Object.entries(dependencies).map(([key, value]) => {
      if (allWorkspacePackageNames.includes(key)) {
        const def = packagesRegistry[key];

        /**
         * When nested internal dependencies are used (internal packages linking
         * to other internal packages), the parentRootRelativeDir will be passed
         * in, and we store the relative path to the isolate/packages
         * directory.
         *
         * For consistency we also write the other file paths starting with ./,
         * but it doesn't seem to be necessary for any package manager.
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
