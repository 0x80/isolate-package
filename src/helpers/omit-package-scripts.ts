import { omit } from "lodash-es";
import path from "node:path";
import { readTypedJsonSync } from "~/utils";
import { PackageManifest } from "./create-packages-registry";
import fs from "fs-extra";

export async function omitPackageScripts(isolateDir: string) {
  const isolatePackageJsonPath = path.join(isolateDir, "package.json");
  const packageManifest = readTypedJsonSync<PackageManifest>(
    isolatePackageJsonPath
  );

  const outputManifest = omit(packageManifest, ["scripts"]);

  await fs.writeFile(
    isolatePackageJsonPath,
    JSON.stringify(outputManifest, null, 2)
  );
}
