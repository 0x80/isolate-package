import fs from "fs-extra";
import path from "node:path";
import { useLogger } from "~/lib/logger";
import type { PackageManifest } from "~/lib/types";
import { readTypedJson } from "~/lib/utils";
import yaml from "yaml";

type CatalogMap = Record<string, string>;
type CatalogsMap = Record<string, CatalogMap>;

interface CatalogSource {
  catalog?: CatalogMap;
  catalogs?: CatalogsMap;
}

const catalogSourceCache = new Map<string, Promise<CatalogSource>>();

/**
 * Loads catalog definitions by checking pnpm-workspace.yaml first (pnpm
 * format), then falling back to the root package.json (Bun format).
 *
 * Pnpm defines catalogs in pnpm-workspace.yaml:
 *
 * ```yaml
 * catalog:
 *   react: ^18.3.1
 * catalogs:
 *   react18:
 *     react: ^18.3.1
 * ```
 *
 * Bun defines catalogs in package.json (at root level or under workspaces).
 */
async function loadCatalogSource(
  workspaceRootDir: string,
): Promise<CatalogSource> {
  if (catalogSourceCache.has(workspaceRootDir)) {
    return catalogSourceCache.get(workspaceRootDir)!;
  }

  const loadPromise = (async () => {
    const log = useLogger();

    // Try pnpm-workspace.yaml first
    const workspaceYamlPath = path.join(
      workspaceRootDir,
      "pnpm-workspace.yaml",
    );

    if (await fs.pathExists(workspaceYamlPath)) {
      try {
        const rawContent = await fs.readFile(workspaceYamlPath, "utf-8");
        const yamlConfig = yaml.parse(rawContent) as CatalogSource | null;

        if (yamlConfig?.catalog || yamlConfig?.catalogs) {
          return {
            catalog: yamlConfig.catalog,
            catalogs: yamlConfig.catalogs,
          };
        }
      } catch (err) {
        log.warn(
          `Failed to parse ${workspaceYamlPath}: ${err instanceof Error ? err.message : String(err)}. Falling back to package.json for catalog definitions.`,
        );
      }
    }

    // Fall back to package.json (Bun format)
    const rootManifestPath = path.join(workspaceRootDir, "package.json");
    const rootManifest = await readTypedJson<
      PackageManifest & {
        catalog?: CatalogMap;
        catalogs?: CatalogsMap;
        workspaces?: {
          catalog?: CatalogMap;
          catalogs?: CatalogsMap;
        };
      }
    >(rootManifestPath);

    return {
      catalog: rootManifest.catalog ?? rootManifest.workspaces?.catalog,
      catalogs: rootManifest.catalogs ?? rootManifest.workspaces?.catalogs,
    };
  })();

  catalogSourceCache.set(workspaceRootDir, loadPromise);
  return loadPromise;
}

/**
 * Resolves catalog dependencies by replacing "catalog:" specifiers with their
 * actual versions.
 *
 * Supports both pnpm and Bun catalog formats:
 *
 * - Pnpm: catalog/catalogs defined in pnpm-workspace.yaml
 * - Bun: catalog or catalogs at root level, or workspaces.catalog in
 *   package.json
 */
export async function resolveCatalogDependencies(
  dependencies: Record<string, string> | undefined,
  workspaceRootDir: string,
): Promise<Record<string, string> | undefined> {
  if (!dependencies) {
    return undefined;
  }

  const log = useLogger();
  const { catalog: flatCatalog, catalogs: nestedCatalogs } =
    await loadCatalogSource(workspaceRootDir);

  if (!flatCatalog && !nestedCatalogs) {
    // No catalog found, return dependencies as-is
    return dependencies;
  }

  const resolved = { ...dependencies };

  for (const [packageName, specifier] of Object.entries(dependencies)) {
    // Check if this is a catalog dependency
    if (specifier === "catalog:" || specifier.startsWith("catalog:")) {
      let catalogVersion: string | undefined;

      if (specifier === "catalog:") {
        // Simple catalog reference - use package name as key
        catalogVersion = flatCatalog?.[packageName];
      } else {
        // Catalog group reference (e.g., "catalog:group1")
        const groupName = specifier.slice(8);
        catalogVersion = nestedCatalogs?.[groupName]?.[packageName];
      }

      if (catalogVersion) {
        log.debug(
          `Resolving catalog dependency ${packageName}: "${specifier}" -> "${catalogVersion}"`,
        );
        resolved[packageName] = catalogVersion;
      } else {
        log.warn(
          `Catalog dependency ${packageName} references "${specifier}" but it's not found in the catalog. Keeping original specifier.`,
        );
      }
    }
  }

  return resolved;
}
