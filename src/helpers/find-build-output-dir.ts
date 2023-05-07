import path from "node:path";
import { config } from "node:process";
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
  try {
    const tsconfig = await readTypedJson<{
      compilerOptions: { outDir: string };
    }>(tsconfigPath);

    return path.join(targetPackageDir, tsconfig.compilerOptions.outDir);
  } catch (err) {
    throw new Error(
      `Failed to find tsconfig at ${tsconfigPath}. Without a buildOutputDir config setting a tsconfig file is required to know where the build output directory is located.If your tsconfig is located elsewhere you can configure it using the tsconfigPath setting.`,
    );
  }
}
