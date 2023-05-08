import path from "node:path";
import { readTypedJson } from "~/utils";
import { PackageManifestMinimum } from "./create-packages-registry";

export async function importManifest(packageDir: string) {
  return readTypedJson<PackageManifestMinimum>(
    path.join(packageDir, "package.json"),
  );
}
