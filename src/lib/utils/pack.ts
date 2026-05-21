import assert from "node:assert";
import { exec } from "node:child_process";
import path from "node:path";
import { useLogger } from "../logger";
import { shouldUsePnpmPack } from "../package-manager";
import { getErrorMessage } from "./get-error-message";
import { waitForCompleteFile } from "./wait-for-complete-file";

/**
 * How long to wait for the packed tarball to appear and stop growing on disk
 * after `pnpm pack` / `npm pack` has exited.
 */
const PACK_FILE_READY_TIMEOUT_MS = 5000;
const PACK_FILE_READY_POLL_MS = 50;

export async function pack(srcDir: string, dstDir: string) {
  const log = useLogger();

  const execOptions = {
    maxBuffer: 10 * 1024 * 1024,
  };

  const previousCwd = process.cwd();
  process.chdir(srcDir);

  /**
   * PNPM pack seems to be a lot faster than NPM pack, so when PNPM is detected
   * we use that instead.
   */
  const stdout = shouldUsePnpmPack()
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
          },
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
          },
        );
      });

  const lastLine = stdout.trim().split("\n").at(-1);

  assert(lastLine, `Failed to parse last line from stdout: ${stdout.trim()}`);

  const fileName = path.basename(lastLine);

  assert(fileName, `Failed to parse file name from: ${lastLine}`);

  const filePath = path.join(dstDir, fileName);

  process.chdir(previousCwd);

  /**
   * `pnpm pack` (and occasionally `npm pack`) can return before the tarball is
   * fully visible/flushed to disk. A naive `existsSync` check is not enough:
   * the directory entry can appear before the file's data has been written,
   * which causes downstream consumers (gunzip + tar) to fail with
   * "unexpected end of file". Wait until the file exists and its size has
   * stopped changing across two consecutive polls before returning.
   */
  await waitForCompleteFile(filePath, {
    timeoutMs: PACK_FILE_READY_TIMEOUT_MS,
    pollMs: PACK_FILE_READY_POLL_MS,
  });

  log.debug(`Packed (temp)/${fileName}`);

  return filePath;
}
