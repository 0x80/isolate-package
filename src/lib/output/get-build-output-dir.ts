import { getTsconfig } from "get-tsconfig";
import path from "node:path";
import outdent from "outdent";
import { useConfig } from "../config";
import { useLogger } from "../logger";

export async function getBuildOutputDir(targetPackageDir: string) {
  const config = useConfig();
  const log = useLogger();

  if (config.buildDirName) {
    log.debug("Using buildDirName from config:", config.buildDirName);
    return path.join(targetPackageDir, config.buildDirName);
  }

  const tsconfigPath = path.join(targetPackageDir, config.tsconfigPath);

  const tsconfig = getTsconfig(tsconfigPath);

  if (tsconfig) {
    log.debug("Found tsconfig at:", tsconfig.path);

    const outDir = tsconfig.config.compilerOptions?.outDir;

    if (outDir) {
      return path.join(targetPackageDir, outDir);
    } else {
      throw new Error(outdent`
        Failed to find outDir in tsconfig. If you are executing isolate from the root of a monorepo you should specify the buildDirName in isolate.config.json.
      `);
    }
  } else {
    log.warn("Failed to find tsconfig at:", tsconfigPath);

    throw new Error(outdent`
      Failed to infer the build output directory from either the isolate config buildDirName or a Typescript config file. See the documentation on how to configure one of these options.
    `);
  }
}
