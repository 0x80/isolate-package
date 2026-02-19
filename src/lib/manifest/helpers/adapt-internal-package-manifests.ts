import { got } from "get-or-throw";
import path from "node:path";
import { omit } from "remeda";
import { usePackageManager } from "~/lib/package-manager";
import type { PackagesRegistry } from "~/lib/types";
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

  await Promise.all(
    internalPackageNames.map(async (packageName) => {
      const { manifest, rootRelativeDir } = got(packagesRegistry, packageName);

      /** Dev dependencies and scripts are never included for internal deps */
      const strippedManifest = omit(manifest, ["scripts", "devDependencies"]);

      /** Resolve catalog dependencies before adapting internal deps */
      const manifestWithResolvedCatalogs = {
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
            manifestWithResolvedCatalogs
          : /** For other package managers we replace the links to internal dependencies */
            adaptManifestInternalDeps({
              manifest: manifestWithResolvedCatalogs,
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
