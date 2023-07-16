import fs from "fs-extra";
import path from "node:path";
import { pack, unpack } from "~/utils";

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
  await unpack(packedFilePath, unpackDir);
  await fs.copy(path.join(unpackDir, "package"), isolateDir);
}
