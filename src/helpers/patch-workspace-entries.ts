import { createLogger } from "~/utils";
import { getConfig } from "./config";
import { PackagesRegistry } from "./create-packages-registry";
import path from "node:path";

export function patchWorkspaceEntries(
  isFunctionsRoot: boolean,
  packageName: string,
  dependencies: Record<string, string>,
  packagesRegistry: PackagesRegistry,
) {
  const log = createLogger(getConfig().logLevel);
  const allWorkspacePackageNames = Object.keys(packagesRegistry);

  return Object.fromEntries(
    Object.entries(dependencies).map(([key, value]) => {
      if (allWorkspacePackageNames.includes(key)) {
        const def = packagesRegistry[key];

		const relativePath = path.relative(packagesRegistry[packageName].rootRelativeDir, def.rootRelativeDir)

        /**
		 * Because shared packages can depend on other shared packages, and installation 
		 * expects the "file:" directive to be relative to the current package.json, we need to 
		 * "subtract" the relative path of the shared dependecy from the path of the current dir.
         */
		const linkedPath = `file:${isFunctionsRoot ? def.rootRelativeDir : relativePath}`

        log.debug(`Patching package ${packageName} ${isFunctionsRoot ? 'which is the cloud function root' : ''}. Linking dependency ${key} to ${linkedPath}`);

        return [key, linkedPath];
      } else {
        return [key, value];
      }
    }),
  );
}
