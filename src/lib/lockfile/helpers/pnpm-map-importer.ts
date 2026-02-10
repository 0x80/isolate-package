import path from "node:path";
import type {
  ProjectSnapshot,
  ResolvedDependencies,
} from "pnpm_lockfile_file_v8";

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

/**
 * Remap internal dependency links to point to the isolated directory structure,
 * and remove link: entries for non-internal packages that won't exist in the
 * isolated output.
 */
function pnpmMapDependenciesLinks(
  importerPath: string,
  def: ResolvedDependencies,
  directoryByPackageName: { [packageName: string]: string }
): ResolvedDependencies {
  return Object.fromEntries(
    Object.entries(def).flatMap(([key, value]) => {
      if (!value.startsWith("link:")) {
        return [[key, value]];
      }

      const directory = directoryByPackageName[key];

      /**
       * Remove entries for packages not in the internal dependencies map. These
       * are external packages that happen to be linked via the link: protocol
       * and won't exist in the isolated output.
       */
      if (directory === undefined) {
        return [];
      }

      /** Replace backslashes with forward slashes to support Windows Git Bash */
      const relativePath = path
        .relative(importerPath, directory)
        .replace(path.sep, path.posix.sep);

      const linkValue = relativePath.startsWith(".")
        ? `link:${relativePath}`
        : `link:./${relativePath}`;

      return [[key, linkValue]];
    })
  );
}
