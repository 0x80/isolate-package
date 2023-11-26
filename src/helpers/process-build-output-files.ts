import fs from "fs-extra";
import path from "node:path";
import { pack, unpack, useLogger } from "~/utils";

const TIMEOUT_MS = 5000;

export async function processBuildOutputFiles({
  targetPackageDir,
  tmpDir,
  isolateDir,
}: {
  targetPackageDir: string;
  tmpDir: string;
  isolateDir: string;
}) {
  const log = useLogger();
  const packedFilePath = await pack(targetPackageDir, tmpDir);
  const unpackDir = path.join(tmpDir, "target");

  const now = Date.now();
  let isWaitingYet = false;

  while (!fs.existsSync(packedFilePath) && Date.now() - now < TIMEOUT_MS) {
    if (!isWaitingYet) {
      log.debug(`Waiting for ${packedFilePath} to become available...`);
    }
    isWaitingYet = true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  await unpack(packedFilePath, unpackDir);
  await fs.copy(path.join(unpackDir, "package"), isolateDir);
}
