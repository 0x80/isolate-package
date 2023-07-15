import { omit } from "lodash-es";
import { createLogger, filterObjectUndefined } from "~/utils";
import {
  PackageManifestMinimum,
  PackagesRegistry,
  getConfig,
  patchWorkspaceEntries,
} from ".";

export function adaptManifestWorkspaceDeps(
  {
    manifest,
    packagesRegistry,
    parentRootRelativeDir,
  }: {
    manifest: PackageManifestMinimum;
    packagesRegistry: PackagesRegistry;
    parentRootRelativeDir: string;
  },
  opts: { includeDevDependencies?: boolean } = {}
): PackageManifestMinimum {
  const log = createLogger(getConfig().logLevel);

  return Object.assign(
    omit(manifest, ["scripts", "devDependencies"]),
    filterObjectUndefined({
      dependencies: manifest.dependencies
        ? patchWorkspaceEntries(
            manifest.dependencies,
            packagesRegistry,
            parentRootRelativeDir
          )
        : undefined,
      devDependencies:
        opts.includeDevDependencies && manifest.devDependencies
          ? patchWorkspaceEntries(
              manifest.devDependencies,
              packagesRegistry,
              parentRootRelativeDir
            )
          : undefined,
    })
  );
}
