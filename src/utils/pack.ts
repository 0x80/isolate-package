import { exec } from "node:child_process";
import path from "node:path";
import { getConfig, usePackageManager } from "~/helpers";
import { createLogger } from "./logger";

export async function pack(srcDir: string, destDir: string) {
  const log = createLogger(getConfig().logLevel);
  const cwd = process.cwd();
  process.chdir(srcDir);

  const { name } = usePackageManager();

  /**
   * PNPM pack seems to be a lot faster than NPM pack, so when PNPM is detected
   * we use that instead.
   */
  switch (name) {
    case "pnpm": {
      const stdout = await new Promise<string>((resolve, reject) => {
        exec(
          `pnpm pack --pack-destination ${destDir}`,
          (err, stdout, stderr) => {
            if (err) {
              log.error(stderr);
              return reject(err);
            }

            resolve(stdout);
          }
        );
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

      // log.debug("Packed", path.basename(packedFilePath));
      log.debug("Packed", packedFilePath);

      process.chdir(cwd);
      return packedFilePath;
    }

    case "yarn":
    case "npm": {
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

      log.debug("Packed", packedFileName);

      process.chdir(cwd);
      return path.join(destDir, packedFileName);
    }
  }
}
