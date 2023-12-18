import { omit, pick } from "ramda";
import { useConfig } from "../config";
import { usePackageManager } from "../package-manager";
import type { PackageManifest, PackagesRegistry } from "../types";
import { adaptManifestInternalDeps } from "./helpers";
import { writeManifest } from "./io";

/**
 * Adapt the output package manifest, so that:
 *
 * - Its internal dependencies point to the isolated ./packages/* directory.
 * - The devDependencies are possibly removed
 * - Scripts are picked or omitted and otherwise removed
 */
export async function adaptTargetPackageManifest(
  manifest: PackageManifest,
  packagesRegistry: PackagesRegistry,
  isolateDir: string
) {
  const packageManager = usePackageManager();
  const { includeDevDependencies, useNpm, pickFromScripts, omitFromScripts } =
    useConfig();

  /** Dev dependencies are omitted by default */
  const inputManifest = includeDevDependencies
    ? manifest
    : omit(["devDependencies"], manifest);

  const adaptedManifest =
    packageManager.name === "pnpm" && !useNpm
      ? /**
         * For PNPM the output itself is a workspace so we can preserve the specifiers
         * with "workspace:*" in the output manifest.
         */
        inputManifest
      : /** For other package managers we replace the links to internal dependencies */
        adaptManifestInternalDeps({
          manifest: inputManifest,
          packagesRegistry,
        });

  const outputManifest = {
    ...adaptedManifest,
    /**
     * Scripts are removed by default if not explicitly picked or omitted via
     * config.
     */
    scripts: pickFromScripts
      ? pick(pickFromScripts as never[], manifest.scripts)
      : omitFromScripts
        ? omit(omitFromScripts as never[], manifest.scripts)
        : undefined,
  };

  await writeManifest(isolateDir, outputManifest);
}
