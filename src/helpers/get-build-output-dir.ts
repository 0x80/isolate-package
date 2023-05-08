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

  log.debug("Looking for tsconfig at:", tsconfigPath);

  if (fs.existsSync(tsconfigPath)) {
    const tsconfig = await readTypedJson<{
      compilerOptions?: { outDir?: string };
    }>(tsconfigPath);

    const outDir = tsconfig.compilerOptions?.outDir;

    if (outDir) {
      return path.join(targetPackageDir, outDir);
    } else {
      throw new Error(outdent`
        Failed to find outDir in tsconfig. If you are executing isolate from the root of a monorepo you should specify the buildDirName in isolate.config.json.
      `);
    }
  } else {
    throw new Error(outdent`
      Failed to infer the build output directory from either the isolate config buildDirName or a Typescript config file. See the documentation on how to configure one of these options.
    `);
  }
}
