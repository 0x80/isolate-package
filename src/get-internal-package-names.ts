import path from "node:path";
import type { IsolateConfig } from "./lib/config";
import { resolveConfig, resolveWorkspacePaths } from "./lib/config";
import { detectPackageManager } from "./lib/package-manager";
import { createPackagesRegistry, listInternalPackages } from "./lib/registry";
import type { PackageManifest } from "./lib/types";
import { readTypedJson } from "./lib/utils";

/**
 * Get the names of all internal workspace packages that the target package
 * depends on. This is useful for tools like tsup that need a list of internal
 * packages to include in `noExternal`.
 *
 * If no config is passed, it reads from `isolate.config.{ts,js,json}` in the
 * current working directory.
 */
export async function getInternalPackageNames(
  config?: IsolateConfig,
): Promise<string[]> {
  const resolvedConfig = resolveConfig(config);
  const { targetPackageDir, workspaceRootDir } =
    resolveWorkspacePaths(resolvedConfig);

  detectPackageManager(workspaceRootDir);

  const targetPackageManifest = await readTypedJson<PackageManifest>(
    path.join(targetPackageDir, "package.json"),
  );

  const packagesRegistry = await createPackagesRegistry(
    workspaceRootDir,
    resolvedConfig.workspacePackages,
  );

  return listInternalPackages(targetPackageManifest, packagesRegistry, {
    includeDevDependencies: resolvedConfig.includeDevDependencies,
  });
}
