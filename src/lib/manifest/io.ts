import fs from "fs-extra";
import path from "node:path";
import type { PackageManifest } from "../types";
import { readTypedJson } from "../utils";

export async function readManifest(packageDir: string) {
  return readTypedJson<PackageManifest>(path.join(packageDir, "package.json"));
}

export async function writeManifest(
  outputDir: string,
  manifest: PackageManifest
) {
  await fs.writeFile(
    path.join(outputDir, "package.json"),
    JSON.stringify(manifest, null, 2)
  );
}
