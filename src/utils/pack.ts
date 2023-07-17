import fs from "fs-extra";
import { exec } from "node:child_process";
import path from "node:path";
import { getConfig } from "~/helpers";
import { Logger, createLogger } from "./logger";

export async function pack(
  srcDir: string,
  destDir: string,
  usePnpmPack = false
) {
  const log = createLogger(getConfig().logLevel);

  const previousCwd = process.cwd();
  process.chdir(srcDir);

  /**
   * PNPM pack seems to be a lot faster than NPM pack, so when PNPM is detected
   * we use that instead.
   */
  if (usePnpmPack) {
    const stdout = await new Promise<string>((resolve, reject) => {
      exec(`pnpm pack --pack-destination ${destDir}`, (err, stdout, stderr) => {
        if (err) {
          log.error(stderr);
          return reject(err);
        }

        resolve(stdout);
      });
    });

    /**
     * @TODO use a regex to see if the result from stdout is a valid file
     * path. It could be that other output like warnings are printed. In that
     * case we can to log the stdout.
     */

    /**
     * Trim newlines and whitespace
     */
    const packedFilePath = stdout.trim();

    validatePackResponse(packedFilePath, log);

    log.debug("PNPM packed", `(temp)/${path.basename(packedFilePath)}`);

    process.chdir(previousCwd);
    return packedFilePath;
  } else {
    const stdout = await new Promise<string>((resolve, reject) => {
      exec(`npm pack --pack-destination ${destDir}`, (err, stdout) => {
        if (err) {
          return reject(err);
        }

        resolve(stdout);
      });
    });

    /**
     * Trim newlines and whitespace
     */
    const packedFileName = stdout.trim();

    validatePackResponse(packedFileName, log);

    log.debug("NPM packed", `(temp)/${path.basename(packedFileName)}`);

    process.chdir(previousCwd);
    return path.join(destDir, packedFileName);
  }
}

function validatePackResponse(filePath: string, log: Logger) {
  if (!fs.existsSync(filePath)) {
    log.warn(`Pack response is not a valid file path: ${filePath}`);
  }
}
