import fs from "fs-extra";
import path, { join } from "node:path";
import { getRelativePath } from "~/utils";
import { createLogger } from "~/utils/logger";
import { PackagesRegistry, getConfig } from ".";
import { unpack } from "../utils/unpack";

export async function unpackDependencies(
  packedFilesByName: Record<string, string>,
  packagesRegistry: PackagesRegistry,
  tmpDir: string,
  isolateDir: string
) {
  const log = createLogger(getConfig().logLevel);
  await Promise.all(
    Object.entries(packedFilesByName).map(async ([packageName, filePath]) => {
      const dir = packagesRegistry[packageName].rootRelativeDir;

      const unpackDir = join(tmpDir, dir);

      log.debug("Unpacking", path.basename(filePath));

      await unpack(filePath, unpackDir);

      const destinationDir = join(isolateDir, dir);

      await fs.ensureDir(destinationDir);

      await fs.move(join(unpackDir, "package"), destinationDir, {
        overwrite: true,
      });

      log.debug(
        `Moved package files to isolate ${getRelativePath(
          destinationDir,
          isolateDir
        )}`
      );
    })
  );
}
