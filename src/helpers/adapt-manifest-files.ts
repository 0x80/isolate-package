import fs from "fs-extra";
import path from "node:path";
import {
  PackagesRegistry,
  adaptManifestWorkspaceDeps,
  getConfig,
} from "~/helpers";
import { createLogger } from "~/utils";

export async function adaptManifestFiles(
  localDependencies: string[],
  packagesRegistry: PackagesRegistry,
  isolateDir: string
) {
  const log = createLogger(getConfig().logLevel);

  await Promise.all(
    localDependencies.map(async (packageName) => {
      const { manifest, rootRelativeDir } = packagesRegistry[packageName];

      log.debug("Adapting manifest file:", packageName);

      const outputManifest = adaptManifestWorkspaceDeps(
        { manifest, packagesRegistry, parentRootRelativeDir: rootRelativeDir },
        { includeDevDependencies: getConfig().includeDevDependencies }
      );

      await fs.writeFile(
        path.join(isolateDir, rootRelativeDir, "package.json"),
        JSON.stringify(outputManifest, null, 2)
      );
    })
  );
}
