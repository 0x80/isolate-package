import { exec } from "node:child_process";
import path from "node:path";
import { PackageManager, getConfig } from "~/helpers";
import { createLogger } from "./logger";

export async function pack(
  srcDir: string,
  destDir: string,
  packageManager: PackageManager,
) {
  const log = createLogger(getConfig().logLevel);
  const cwd = process.cwd();
  process.chdir(srcDir);

  /**
   * PNPM pack seems to be a lot faster than NPM pack, so when PNPM is detected we
   * use that instead.
   */
  switch (packageManager) {
    case "pnpm": {
      const stdout = await new Promise<string>((resolve, reject) => {
        exec(`pnpm pack --pack-destination ${destDir}`, (err, stdout) => {
          if (err) {
            return reject(err);
          }

          resolve(stdout);
        });
      });

      /**
       * Trim newlines and whitespace
       */
      const packedFilePath = stdout.trim();

      log.debug("Packed", path.basename(packedFilePath));

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
