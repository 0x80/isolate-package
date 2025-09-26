import type { PackageManifest as PnpmPackageManifest } from "@pnpm/types";

export type PackageManifest = PnpmPackageManifest & {
  packageManager?: string;
  pnpm?: {
    patchedDependencies?: Record<string, string>;
    [key: string]: unknown;
  };
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

export type FirebaseFunctionsConfig = {
  source: string;
  runtime?: string;
  predeploy?: string[];
  codebase?: string;
};
