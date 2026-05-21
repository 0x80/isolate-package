import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { waitForCompleteFile } from "./wait-for-complete-file";

describe("waitForCompleteFile", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "isolate-wait-for-file-"),
    );
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  it("resolves for a file that already exists with stable size", async () => {
    const filePath = path.join(tempDir, "ready.bin");
    await fs.writeFile(filePath, Buffer.alloc(1024, 0x42));

    await expect(
      waitForCompleteFile(filePath, { timeoutMs: 1000, pollMs: 20 }),
    ).resolves.toBeUndefined();
  });

  it("waits until a file that appears late is written", async () => {
    const filePath = path.join(tempDir, "late.bin");

    setTimeout(() => {
      void fs.writeFile(filePath, Buffer.alloc(512, 0x01));
    }, 60);

    await expect(
      waitForCompleteFile(filePath, { timeoutMs: 1000, pollMs: 20 }),
    ).resolves.toBeUndefined();

    const { size } = await fs.stat(filePath);
    expect(size).toBe(512);
  });

  it("waits for size to stabilize when a file grows in chunks", async () => {
    const filePath = path.join(tempDir, "growing.bin");
    const pollMs = 100;
    /**
     * Each chunk arrives well within a single poll interval, so the wait
     * cannot see two consecutive equal sizes until growth stops. With a
     * 100ms poll, 30ms between chunks safely satisfies that.
     */
    const chunkIntervalMs = 30;
    const chunkCount = 5;

    const writes = Array.from({ length: chunkCount }, (_, i) =>
      setTimeout(
        () => {
          const op =
            i === 0
              ? fs.writeFile(filePath, Buffer.alloc(100, i + 1))
              : fs.appendFile(filePath, Buffer.alloc(100, i + 1));
          void op;
        },
        chunkIntervalMs * (i + 1),
      ),
    );

    try {
      await waitForCompleteFile(filePath, { timeoutMs: 2000, pollMs });

      /**
       * Returning before the file finished growing would leave size below
       * chunkCount * 100. Observing the full size confirms the wait did not
       * exit mid-write.
       */
      const { size } = await fs.stat(filePath);
      expect(size).toBe(chunkCount * 100);
    } finally {
      writes.forEach((t) => clearTimeout(t));
    }
  });

  it("rejects with a timeout error when the file never appears", async () => {
    const filePath = path.join(tempDir, "missing.bin");

    await expect(
      waitForCompleteFile(filePath, { timeoutMs: 150, pollMs: 20 }),
    ).rejects.toThrow(/Timed out after 150ms/);
  });

  it("rejects with a timeout error when the file stays empty", async () => {
    const filePath = path.join(tempDir, "empty.bin");
    await fs.writeFile(filePath, "");

    await expect(
      waitForCompleteFile(filePath, { timeoutMs: 150, pollMs: 20 }),
    ).rejects.toThrow(/Timed out/);
  });
});
