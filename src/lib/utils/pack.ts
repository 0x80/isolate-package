import { exec } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { useLogger } from "../logger";
import { usePackageManager } from "../package-manager";
import { getErrorMessage } from "./get-error-message";

export async function pack(srcDir: string, dstDir: string) {
  const log = useLogger();
  const { name, version } = usePackageManager();

  const versionMajor = parseInt(version.split(".")[0], 10);

  const usePnpmPack = name === "pnpm" && versionMajor >= 8;

  if (usePnpmPack) {
    log.debug("Using PNPM pack instead of NPM pack");
  }

  const execOptions = {
    maxBuffer: 10 * 1024 * 1024,
  };

  const previousCwd = process.cwd();
  process.chdir(srcDir);

  /**
   * PNPM pack seems to be a lot faster than NPM pack, so when PNPM is detected
   * we use that instead.
   */
  const stdout = usePnpmPack
    ? await new Promise<string>((resolve, reject) => {
        exec(
          `pnpm pack --pack-destination "${dstDir}"`,
          execOptions,
          (err, stdout) => {
            if (err) {
              log.error(getErrorMessage(err));
              return reject(err);
            }

            resolve(stdout);
          }
        );
      })
    : await new Promise<string>((resolve, reject) => {
        exec(
          `npm pack --pack-destination "${dstDir}"`,
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
