import { createReadStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";
import { extract as extractTar } from "tar-fs";

/**
 * Extract a gzipped tar archive into the given directory.
 *
 * Uses `stream/promises.pipeline` so that errors at any stage (file read,
 * gunzip, tar extract) propagate as a rejected promise rather than crashing
 * the process as unhandled stream errors.
 */
export async function unpack(filePath: string, unpackDir: string) {
  await pipeline(
    createReadStream(filePath),
    createGunzip(),
    extractTar(unpackDir),
  );
}
