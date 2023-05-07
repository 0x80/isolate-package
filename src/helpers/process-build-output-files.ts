import fs from "fs-extra";
import path from "node:path";
import { PackageManager } from "~/helpers";
import { pack, unpack } from "~/utils";

export async function processBuildOutputFiles({
  targetPackageDir,
  tmpDir,
  packageManager,
  isolateDir,
}: {
  targetPackageDir: string;
  tmpDir: string;
  packageManager: PackageManager;
  isolateDir: string;
}) {
  const packedFilePath = await pack(targetPackageDir, tmpDir, packageManager);
  const unpackDir = path.join(tmpDir, "target");
  await unpack(packedFilePath, unpackDir);
  await fs.copy(path.join(unpackDir, "package"), isolateDir);
}
