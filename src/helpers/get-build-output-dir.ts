import fs from "fs-extra";
import path from "node:path";
import outdent from "outdent";
import { getConfig } from "~/helpers";
import { createLogger, readTypedJson } from "~/utils";

export async function getBuildOutputDir(targetPackageDir: string) {
  const config = getConfig();
  const log = createLogger(getConfig().logLevel);

  if (config.buildDirName) {
    log.debug("Using buildDirName from config:", config.buildDirName);
    return path.join(targetPackageDir, config.buildDirName);
  }

  const tsconfigPath = path.join(targetPackageDir, config.tsconfigPath);

  if (fs.existsSync(tsconfigPath)) {
    const tsconfig = await readTypedJson<{
      compilerOptions?: { outDir?: string };
    }>(tsconfigPath);

    const outDir = tsconfig.compilerOptions?.outDir;

    if (outDir) {
      return path.join(targetPackageDir, outDir);
    }
  }

  throw new Error(outdent`
    Failed to find outDir in tsconfig at ${tsconfigPath}. Without an isolate.config.json file specifying the buildDirName, or an outDir setting provided by tsconfig, we don't know where the build output directory is located. Please configure one of these options.
  `);
}
