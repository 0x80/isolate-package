import fs from "node:fs";

/**
 * Wait until the given file exists and its size has stopped changing across
 * two consecutive polls. Resolves once the file is considered fully written,
 * rejects with a timeout error otherwise.
 *
 * This is a cheap proxy for "the writer has finished flushing" without
 * inspecting file contents or relying on platform-specific signals. It is
 * intended for cases where an external process (e.g. `pnpm pack`) may report
 * completion before its output is fully visible on disk.
 */
export async function waitForCompleteFile(
  filePath: string,
  { timeoutMs, pollMs }: { timeoutMs: number; pollMs: number },
) {
  const deadline = Date.now() + timeoutMs;
  let lastSize = -1;

  while (Date.now() < deadline) {
    try {
      const { size } = await fs.promises.stat(filePath);

      if (size > 0 && size === lastSize) {
        return;
      }

      lastSize = size;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
      /** File not visible yet; keep polling. */
    }

    await new Promise<void>((resolve) => {
      setTimeout(resolve, pollMs);
    });
  }

  throw new Error(
    `Timed out after ${timeoutMs}ms waiting for file to be written: ${filePath}`,
  );
}
