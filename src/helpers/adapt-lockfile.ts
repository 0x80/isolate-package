import type {
  ProjectSnapshot,
  ResolvedDependencies,
} from "@pnpm/lockfile-file";
import { mapValues } from "lodash-es";
import type { PackageManagerName } from "./detect-package-manager";

export function getLockfileFileName(name: PackageManagerName) {
  switch (name) {
    case "pnpm":
      return "pnpm-lock.yaml";
    case "yarn":
      return "yarn.lock";
    case "npm":
      return "package-lock.json";
  }
}

export function mapImporterLinks({
  dependencies,
  devDependencies,
  ...rest
}: ProjectSnapshot): ProjectSnapshot {
  return {
    dependencies: dependencies ? mapDependenciesLinks(dependencies) : undefined,
    devDependencies: devDependencies
      ? mapDependenciesLinks(devDependencies)
      : undefined,
    ...rest,
  };
}

function mapDependenciesLinks(def: ResolvedDependencies): ResolvedDependencies {
  return mapValues(def, (version) =>
    version.startsWith("link:") ? convertVersionLink(version) : version
  );
}

function convertVersionLink(version: string) {
  const regex = /([^/]+)$/;

  const match = version.match(regex);

  if (!match) {
    throw new Error(
      `Failed to extract package folder name from link ${version}`
    );
  }

  const packageFolderName = match[1];

  return `link:./packages/${packageFolderName}`;
}
