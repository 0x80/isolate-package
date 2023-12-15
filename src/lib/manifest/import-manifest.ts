import path from "node:path";
import type { PackageManifest } from "../types";
import { readTypedJson } from "../utils";

export async function importManifest(packageDir: string) {
  return readTypedJson<PackageManifest>(path.join(packageDir, "package.json"));
}
