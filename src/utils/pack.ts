import fs from "fs-extra";
import { exec } from "node:child_process";
import path from "node:path";
import { useLogger } from "./logger";

export async function pack(
  srcDir: string,
  dstDir: string,
  usePnpmPack = false
) {
  const execOptions = {
    maxBuffer: 10 * 1024 * 1024,
  };

  const log = useLogger();

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
          execOptions,
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
        exec(
          `npm pack --pack-destination ${dstDir}`,
          execOptions,
          (err, stdout) => {
            if (err) {
              return reject(err);
            }

            resolve(stdout);
          }
        );
      });

  const fileName = path.basename(stdout.trim());

  const filePath = path.join(dstDir, fileName);

  if (!fs.existsSync(filePath)) {
    log.error(
      `The response from pack could not be resolved to an existing file: ${filePath}`
    );
  } else {
    log.debug(`Packed (temp)/${fileName}`);
  }

  process.chdir(previousCwd);

  /**
   * Return the path anyway even if it doesn't validate. A later stage will wait
   * for the file to occur still. Not sure if this makes sense. Maybe we should
   * stop at the validation error...
   */
  return filePath;
}
