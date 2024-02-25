import path from "node:path";
import { omit } from "remeda";
import { useConfig } from "~/lib/config";
import { usePackageManager } from "~/lib/package-manager";
import type { PackagesRegistry } from "~/lib/types";
import { writeManifest } from "../io";
import { adaptManifestInternalDeps } from "./adapt-manifest-internal-deps";

/**
 * Adapt the manifest files of all the isolated internal packages (excluding the
 * target package), so that their dependencies point to the other isolated
 * packages in the same folder.
 */
export async function adaptInternalPackageManifests(
  internalPackageNames: string[],
  packagesRegistry: PackagesRegistry,
  isolateDir: string
) {
  const packageManager = usePackageManager();
  const { forceNpm } = useConfig();

  await Promise.all(
    internalPackageNames.map(async (packageName) => {
      const { manifest, rootRelativeDir } = packagesRegistry[packageName];

      /** Dev dependencies and scripts are never included for internal deps */
      const inputManifest = omit(manifest, ["scripts", "devDependencies"]);

      const outputManifest =
        packageManager.name === "pnpm" && !forceNpm
          ? /**
             * For PNPM the output itself is a workspace so we can preserve the specifiers
             * with "workspace:*" in the output manifest.
             */
            inputManifest
          : /** For other package managers we replace the links to internal dependencies */
            adaptManifestInternalDeps({
              manifest: inputManifest,
              packagesRegistry,
              parentRootRelativeDir: rootRelativeDir,
            });

      await writeManifest(
        path.join(isolateDir, rootRelativeDir),
        outputManifest
      );
    })
  );
}
