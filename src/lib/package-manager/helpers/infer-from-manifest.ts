import fs from "fs-extra";
import assert from "node:assert";
import path from "node:path";
import { useLogger } from "~/lib/logger";
import { getMajorVersion } from "~/lib/utils/get-major-version";
import type { PackageManifest } from "../../types";
import { readTypedJsonSync } from "../../utils";
import type { PackageManagerName } from "../names";
import { getLockfileFileName, supportedPackageManagerNames } from "../names";

export function inferFromManifest(workspaceRoot: string) {
  const log = useLogger();

  const { packageManager: manifestPackageManager } =
    readTypedJsonSync<PackageManifest>(
      path.join(workspaceRoot, "package.json")
    );

  if (!manifestPackageManager) {
    log.debug("No packageManager field found in root manifest");
    return;
  }

  const [name, version = "*"] = manifestPackageManager.split("@") as [
    PackageManagerName,
    string,
  ];

  assert(
    supportedPackageManagerNames.includes(name),
    `Package manager "${name}" is not currently supported`
  );

  const lockfileName = getLockfileFileName(name);

  assert(
    fs.existsSync(path.join(workspaceRoot, lockfileName)),
    `Manifest declares ${name} to be the packageManager, but failed to find ${lockfileName} in workspace root`
  );

  return {
    name,
    version,
    majorVersion: getMajorVersion(version),
    manifestPackageManager,
  };
}
