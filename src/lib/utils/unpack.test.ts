import fs from "fs-extra";
import { createWriteStream } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";
import { pack as packTar } from "tar-fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { unpack } from "./unpack";

async function createTarball(srcDir: string, tarballPath: string) {
  await pipeline(packTar(srcDir), createGzip(), createWriteStream(tarballPath));
}

describe("unpack", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "isolate-unpack-test-"));
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  it("extracts a valid gzipped tarball into the destination directory", async () => {
    const srcDir = path.join(tempDir, "src");
    await fs.ensureDir(path.join(srcDir, "nested"));
    await fs.writeFile(path.join(srcDir, "root.txt"), "hello");
    await fs.writeFile(path.join(srcDir, "nested", "leaf.txt"), "world");

    const tarballPath = path.join(tempDir, "archive.tgz");
    await createTarball(srcDir, tarballPath);

    const unpackDir = path.join(tempDir, "out");
    await unpack(tarballPath, unpackDir);

    expect(await fs.readFile(path.join(unpackDir, "root.txt"), "utf8")).toBe(
      "hello",
    );
    expect(
      await fs.readFile(path.join(unpackDir, "nested", "leaf.txt"), "utf8"),
    ).toBe("world");
  });

  it("rejects with an error when the tarball is truncated", async () => {
    const srcDir = path.join(tempDir, "src");
    await fs.ensureDir(srcDir);
    await fs.writeFile(path.join(srcDir, "file.txt"), "a".repeat(8192));

    const tarballPath = path.join(tempDir, "archive.tgz");
    await createTarball(srcDir, tarballPath);

    const truncatedPath = path.join(tempDir, "truncated.tgz");
    const fullData = await fs.readFile(tarballPath);
    await fs.writeFile(truncatedPath, fullData.subarray(0, 32));

    const unpackDir = path.join(tempDir, "out");

    /**
     * Pre-fix, the gunzip error from a truncated archive surfaced as an
     * unhandled stream error and crashed the process. With `pipeline` the
     * same scenario must reject the returned promise so callers can handle
     * it.
     */
    await expect(unpack(truncatedPath, unpackDir)).rejects.toThrow();
  });

  it("rejects when the source path does not exist", async () => {
    const unpackDir = path.join(tempDir, "out");

    await expect(
      unpack(path.join(tempDir, "does-not-exist.tgz"), unpackDir),
    ).rejects.toThrow();
  });
});
