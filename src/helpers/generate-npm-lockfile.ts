import Arborist from "@npmcli/arborist";
import fs from "node:fs/promises";
import path from "node:path";
import { PackagesRegistry } from "./create-packages-registry";

/**
 * Arborist does not seem to work on PNPM installed node_modules folders
 */
export async function generateNpmLockfile({
  workspaceRootDir,
  targetPackageName,
  packagesRegistry,
  isolateDir,
}: {
  workspaceRootDir: string;
  targetPackageName: string;
  packagesRegistry: PackagesRegistry;
  isolateDir: string;
}) {
  console.log("+++ generateLockfile");
  console.log("+++ isolateDir", isolateDir);

  const internalPackageNames = Object.keys(packagesRegistry);
  console.log("+++ internal packages", internalPackageNames);

  /**
   * Should be a list of local package names I think
   */

  // Create a tree of the dependencies for this workspace.
  const arborist = new Arborist({ path: workspaceRootDir });
  const { meta } = await arborist.buildIdealTree({ rm: internalPackageNames });
  meta?.commit();

  const lockfilePath = path.join(isolateDir, "package-lock.json");
  // Write `package-lock.json` file in the `dist/` directory.
  // await fs.mkdir(path.join(isolateDir, "dist"), { recursive: true });
  await fs.writeFile(lockfilePath, String(meta));

  console.log("+++ generated lockfile at", lockfilePath);
}
