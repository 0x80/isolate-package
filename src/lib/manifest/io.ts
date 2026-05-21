import fs from "fs-extra";
import path from "node:path";
import type { PackageManifest } from "../types";
import { readTypedJson } from "../utils";

export async function readManifest(
  packageDir: string,
): Promise<PackageManifest> {
  return (await readTypedJson(
    path.join(packageDir, "package.json"),
  )) as PackageManifest;
}

export async function writeManifest(
  outputDir: string,
  manifest: PackageManifest,
) {
  await fs.writeFile(
    path.join(outputDir, "package.json"),
    JSON.stringify(manifest, null, 2),
  );
}
