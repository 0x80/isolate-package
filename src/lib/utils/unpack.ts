import fs from "fs-extra";
import tar from "tar-fs";
import { createGunzip } from "zlib";

export async function unpack(filePath: string, unpackDir: string) {
  await new Promise<void>((resolve, reject) => {
    fs.createReadStream(filePath)
      .pipe(createGunzip())
      .pipe(tar.extract(unpackDir))
      .on("finish", () => resolve())
      .on("error", (err) => reject(err));
  });
}
