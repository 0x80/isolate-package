import path from "node:path";
import { readTypedJson } from "~/utils";
import { PackageManifest } from "./create-packages-registry";

export async function importManifest(packageDir: string) {
  return readTypedJson<PackageManifest>(path.join(packageDir, "package.json"));
}
