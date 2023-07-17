import fs from "fs-extra";
import { exec } from "node:child_process";
import path from "node:path";
import { getConfig } from "~/helpers";
import { Logger, createLogger } from "./logger";

export async function pack(
  srcDir: string,
  dstDir: string,
  usePnpmPack = false
) {
  const log = createLogger(getConfig().logLevel);

  const previousCwd = process.cwd();
  process.chdir(srcDir);

  /**
   * PNPM pack seems to be a lot faster than NPM pack, so when PNPM is detected
   * we use that instead.
   */
  const stdout = usePnpmPack
    ? await new Promise<string>((resolve, reject) => {
        exec(
          `pnpm pack --pack-destination ${dstDir}`,
          (err, stdout, stderr) => {
            if (err) {
              log.error(stderr);
              return reject(err);
            }

            resolve(stdout);
          }
        );
      })
    : await new Promise<string>((resolve, reject) => {
        exec(`npm pack --pack-destination ${dstDir}`, (err, stdout) => {
          if (err) {
            return reject(err);
          }

          resolve(stdout);
        });
      });

  const fileName = path.basename(stdout.trim());

  const absolutePath = path.join(dstDir, fileName);

  validatePackResponse(absolutePath, log);

  log.debug(`${usePnpmPack ? "PNPM" : "NPM"} packed (temp)/${fileName}`);

  process.chdir(previousCwd);

  return absolutePath;
}

function validatePackResponse(filePath: string, log: Logger) {
  if (!fs.existsSync(filePath)) {
    log.error(`Pack response is not a valid file path: ${filePath}`);
  }
}
