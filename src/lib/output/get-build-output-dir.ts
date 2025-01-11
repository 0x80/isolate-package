import { getTsconfig } from "get-tsconfig";
import path from "node:path";
import outdent from "outdent";
import { useLogger } from "../logger";

export async function getBuildOutputDir({
  targetPackageDir,
  buildDirName,
  tsconfigPath,
}: {
  targetPackageDir: string;
  buildDirName?: string;
  tsconfigPath: string;
}) {
  const log = useLogger();

  if (buildDirName) {
    log.debug("Using buildDirName from config:", buildDirName);
    return path.join(targetPackageDir, buildDirName);
  }

  const fullTsconfigPath = path.join(targetPackageDir, tsconfigPath);

  const tsconfig = getTsconfig(fullTsconfigPath);

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
    log.warn("Failed to find tsconfig at:", fullTsconfigPath);

    throw new Error(outdent`
      Failed to infer the build output directory from either the isolate config buildDirName or a Typescript config file. See the documentation on how to configure one of these options.
    `);
  }
}
