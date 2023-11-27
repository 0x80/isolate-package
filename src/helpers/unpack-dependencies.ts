import fs from "fs-extra";
import path, { join } from "node:path";
import { getIsolateRelativePath, useLogger } from "../utils";
import { unpack } from "../utils/unpack";
import type { PackagesRegistry } from "./create-packages-registry";

export async function unpackDependencies(
  packedFilesByName: Record<string, string>,
  packagesRegistry: PackagesRegistry,
  tmpDir: string,
  isolateDir: string
) {
  const log = useLogger();

  await Promise.all(
    Object.entries(packedFilesByName).map(async ([packageName, filePath]) => {
      const dir = packagesRegistry[packageName].rootRelativeDir;
      const unpackDir = join(tmpDir, dir);

      log.debug("Unpacking", `(temp)/${path.basename(filePath)}`);

      await unpack(filePath, unpackDir);

      const destinationDir = join(isolateDir, dir);

      await fs.ensureDir(destinationDir);

      await fs.move(join(unpackDir, "package"), destinationDir, {
        overwrite: true,
      });

      log.debug(
        `Moved package files to ${getIsolateRelativePath(
          destinationDir,
          isolateDir
        )}`
      );
    })
  );
}
