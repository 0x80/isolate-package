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
    includePatchedDependencies: boolean;
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
    if (value.startsWith("link:")) {
      let relativePath = path.relative(
        importerPath,
        directoryByPackageName[key]
      );
      if (!relativePath.startsWith(".") && !relativePath.startsWith("/")) {
        relativePath = `./${relativePath}`;
      }
      return `link:${relativePath}`;
    } else {
      return value;
    }
  });
}
