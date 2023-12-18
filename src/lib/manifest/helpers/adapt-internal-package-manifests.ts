import path from "node:path";
import { omit } from "ramda";
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
  const { includeDevDependencies } = useConfig();

  await Promise.all(
    internalPackageNames.map(async (packageName) => {
      const { manifest, rootRelativeDir } = packagesRegistry[packageName];

      /**
       * Dev dependencies are omitted by default. And also, for internal
       * dependencies we want to omit the peerDependencies, because installing
       * these is the responsibility of the consuming app / service, and
       * otherwise the frozen lockfile install will error since the package file
       * contains something that is not referenced in the lockfile.
       */
      const inputManifest = includeDevDependencies
        ? omit(["peerDependencies"], manifest)
        : omit(["devDependencies", "peerDependencies"], manifest);

      const outputManifest =
        packageManager.name === "pnpm"
          ? /**
             * For PNPM the output itself is a workspace so we can preserve the specifiers
             * with "workspace:*" in the output manifest.
             */
            inputManifest
          : adaptManifestInternalDeps({
              manifest,
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
