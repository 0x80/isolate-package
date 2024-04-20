import { omit, pick } from "remeda";
import { useConfig } from "../config";
import { usePackageManager } from "../package-manager";
import type { PackageManifest, PackagesRegistry } from "../types";
import { adaptManifestInternalDeps, adoptPnpmFieldsFromRoot } from "./helpers";

/**
 * Adapt the output package manifest, so that:
 *
 * - Its internal dependencies point to the isolated ./packages/* directory.
 * - The devDependencies are possibly removed
 * - Scripts are picked or omitted and otherwise removed
 */
export async function adaptTargetPackageManifest({
  manifest,
  packagesRegistry,
  workspaceRootDir,
}: {
  manifest: PackageManifest;
  packagesRegistry: PackagesRegistry;
  workspaceRootDir: string;
}) {
  const packageManager = usePackageManager();
  const { includeDevDependencies, pickFromScripts, omitFromScripts } =
    useConfig();

  /** Dev dependencies are omitted by default */
  const inputManifest = includeDevDependencies
    ? manifest
    : omit(manifest, ["devDependencies"]);

  const adaptedManifest =
    packageManager.name === "pnpm"
      ? /**
         * For PNPM the output itself is a workspace so we can preserve the specifiers
         * with "workspace:*" in the output manifest, but we do want to adopt the
         * pnpm.overrides field from the root package.json.
         */
        await adoptPnpmFieldsFromRoot(inputManifest, workspaceRootDir)
      : /** For other package managers we replace the links to internal dependencies */
        adaptManifestInternalDeps({
          manifest: inputManifest,
          packagesRegistry,
        });

  return {
    ...adaptedManifest,
    /** Adopt the package manager definition from the root manifest if available. */
    packageManager: packageManager.packageManagerString,
    /**
     * Scripts are removed by default if not explicitly picked or omitted via
     * config.
     */
    scripts: pickFromScripts
      ? pick(manifest.scripts ?? {}, pickFromScripts)
      : omitFromScripts
        ? omit(manifest.scripts ?? {}, omitFromScripts)
        : undefined,
  };
}
