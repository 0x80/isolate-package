import fs from "fs-extra";
import path from "node:path";
import { unpack } from "../utils";
import { pack } from "../utils/pack";

export async function processBuildOutputFiles({
  targetPackageDir,
  tmpDir,
  isolateDir,
}: {
  targetPackageDir: string;
  tmpDir: string;
  isolateDir: string;
}) {
  const packedFilePath = await pack(targetPackageDir, tmpDir);
  const unpackDir = path.join(tmpDir, "target");

  /**
   * `pack` already waits for the tarball to be fully written before returning,
   * so it is safe to unpack immediately.
   */
  await unpack(packedFilePath, unpackDir);
  await fs.copy(path.join(unpackDir, "package"), isolateDir);
}
