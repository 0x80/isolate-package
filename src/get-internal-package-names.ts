import path from "node:path";
import type { IsolateConfig } from "./lib/config";
import { resolveConfig } from "./lib/config";
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

  const targetPackageDir = resolvedConfig.targetPackagePath
    ? path.join(process.cwd(), resolvedConfig.targetPackagePath)
    : process.cwd();

  const workspaceRootDir = resolvedConfig.targetPackagePath
    ? process.cwd()
    : path.join(targetPackageDir, resolvedConfig.workspaceRoot);

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
