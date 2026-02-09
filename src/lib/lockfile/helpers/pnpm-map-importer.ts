import path from "node:path";
import type {
  ProjectSnapshot,
  ResolvedDependencies,
} from "pnpm_lockfile_file_v8";

import { mapValues } from "remeda";

/** Convert dependency links */
export function pnpmMapImporter(
  importerPath: string,
  { dependencies, devDependencies, ...rest }: ProjectSnapshot,
  {
    includeDevDependencies,
    directoryByPackageName,
  }: {
    includeDevDependencies: boolean;
    directoryByPackageName: { [packageName: string]: string };
  }
): ProjectSnapshot {
  return {
    dependencies: dependencies
      ? pnpmMapDependenciesLinks(
          importerPath,
          dependencies,
          directoryByPackageName
        )
      : undefined,
    devDependencies:
      includeDevDependencies && devDependencies
        ? pnpmMapDependenciesLinks(
            importerPath,
            devDependencies,
            directoryByPackageName
          )
        : undefined,
    ...rest,
  };
}

function pnpmMapDependenciesLinks(
  importerPath: string,
  def: ResolvedDependencies,
  directoryByPackageName: { [packageName: string]: string }
): ResolvedDependencies {
  return mapValues(def, (value, key) => {
    if (!value.startsWith("link:")) {
      return value;
    }

    const directory = directoryByPackageName[key];

    /**
     * Skip link remapping for packages not in the internal dependencies map.
     * These are external packages that happen to be linked (e.g. via file:
     * protocol) and don't need their paths adjusted.
     */
    if (directory === undefined) {
      return value;
    }

    /** Replace backslashes with forward slashes to support Windows Git Bash */
    const relativePath = path
      .relative(importerPath, directory)
      .replace(path.sep, path.posix.sep);

    return relativePath.startsWith(".")
      ? `link:${relativePath}`
      : `link:./${relativePath}`;
  });
}
