import fs from "fs-extra";
import path from "node:path";
import outdent from "outdent";
import { getConfig } from "~/helpers";
import { createLogger, readTypedJson } from "~/utils";

/**
 * Find the build output dir by reading the tsconfig.json file or if that
 * doesn't exist by looking for a dist, build, or output directory.
 */
export async function findBuildOutputDir(targetPackageDir: string) {
  const config = getConfig();
  const log = createLogger(getConfig().logLevel);

  if (config.buildOutputDir) {
    log.debug("Using buildOutputDir from config:", config.buildOutputDir);
    return path.join(targetPackageDir, config.buildOutputDir);
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
    Failed to find outDir in tsconfig at ${tsconfigPath}. Without an isolate.config.json file specifying the buildOutputDir, or outDir provided by tsconfig, we can't know where the build output directory is located. Please configure one of these options.
  `);
}
