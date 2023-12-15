import type { PackageManifest as PnpmPackageManifest } from "@pnpm/types";

export type PackageManifest = PnpmPackageManifest & {
  packageManager?: string;
};

export type WorkspacePackageInfo = {
  absoluteDir: string;
  /**
   * The path of the package relative to the workspace root. This is the path
   * referenced in the lock file.
   */
  rootRelativeDir: string;
  /** The package.json file contents */
  manifest: PackageManifest;
};

export type PackagesRegistry = Record<string, WorkspacePackageInfo>;
