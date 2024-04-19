import type {
  ProjectSnapshot,
  ResolvedDependencies,
} from "pnpm_lockfile_file_v8";
import { mapValues } from "remeda";

/** Convert dependency links */
export function pnpmMapImporter(
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
      ? pnpmMapDependenciesLinks(dependencies, directoryByPackageName)
      : undefined,
    devDependencies:
      includeDevDependencies && devDependencies
        ? pnpmMapDependenciesLinks(devDependencies, directoryByPackageName)
        : undefined,
    ...rest,
  };
}

function pnpmMapDependenciesLinks(
  def: ResolvedDependencies,
  directoryByPackageName: { [packageName: string]: string }
): ResolvedDependencies {
  return mapValues(def, (value, key) =>
    value.startsWith("link:") ? `link:./${directoryByPackageName[key]}` : value
  );
}
