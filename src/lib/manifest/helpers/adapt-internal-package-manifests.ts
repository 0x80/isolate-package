import { got } from "get-or-throw";
import path from "node:path";
import { omit } from "remeda";
import { usePackageManager } from "#/lib/package-manager";
import type { PackagesRegistry } from "#/lib/types";
import { writeManifest } from "../io";
import { adaptManifestInternalDeps } from "./adapt-manifest-internal-deps";
import { resolveCatalogDependencies } from "./resolve-catalog-dependencies";

/**
 * Adapt the manifest files of all the isolated internal packages (excluding the
 * target package), so that their dependencies point to the other isolated
 * packages in the same folder.
 */
export async function adaptInternalPackageManifests({
  internalPackageNames,
  packagesRegistry,
  isolateDir,
  forceNpm,
  workspaceRootDir,
}: {
  internalPackageNames: string[];
  packagesRegistry: PackagesRegistry;
  isolateDir: string;
  forceNpm: boolean;
  workspaceRootDir: string;
}) {
  const packageManager = usePackageManager();

  /**
   * For PNPM (non-forceNpm) the isolated output is itself a pnpm workspace with
   * its `pnpm-workspace.yaml` catalog definitions preserved, so "catalog:"
   * specifiers are kept verbatim to stay in sync with the lockfile importers
   * (see issue #198). For other package managers the catalog is not available
   * in the output, so we resolve the specifiers to versions.
   */
  const isPnpmWorkspaceOutput = packageManager.name === "pnpm" && !forceNpm;

  await Promise.all(
    internalPackageNames.map(async (packageName) => {
      const { manifest, rootRelativeDir } = got(packagesRegistry, packageName);

      /** Dev dependencies are never included for internal deps */
      const strippedManifest = omit(manifest, ["devDependencies"]);

      /**
       * Strip the `prepare` script because it runs during `pnpm install` and
       * typically depends on devDependency binaries (e.g. tsdown, del-cli)
       * which are not available in the isolated output. Other lifecycle
       * scripts like `postinstall` are preserved because they handle runtime
       * setup (e.g. Prisma client generation).
       */
      if (strippedManifest.scripts) {
        strippedManifest.scripts = omit(strippedManifest.scripts, ["prepare"]);
      }

      const preparedManifest = isPnpmWorkspaceOutput
        ? strippedManifest
        : {
            ...strippedManifest,
            dependencies: await resolveCatalogDependencies(
              strippedManifest.dependencies,
              workspaceRootDir,
            ),
          };

      const outputManifest =
        (packageManager.name === "pnpm" || packageManager.name === "bun") &&
        !forceNpm
          ? /**
             * For PNPM and Bun the output itself is a workspace so we can preserve
             * the specifiers with "workspace:*" in the output manifest.
             */
            preparedManifest
          : /** For other package managers we replace the links to internal dependencies */
            adaptManifestInternalDeps({
              manifest: preparedManifest,
              packagesRegistry,
              parentRootRelativeDir: rootRelativeDir,
            });

      await writeManifest(
        path.join(isolateDir, rootRelativeDir),
        outputManifest,
      );
    }),
  );
}
