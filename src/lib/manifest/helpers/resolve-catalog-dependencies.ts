import path from "node:path";
import { useLogger } from "~/lib/logger";
import type { PackageManifest } from "~/lib/types";
import { readTypedJson } from "~/lib/utils";

/**
 * Resolves catalog dependencies by replacing "catalog:" specifiers with their
 * actual versions from the root package.json catalog field.
 *
 * Supports both pnpm and Bun catalog formats:
 *
 * - Pnpm: catalog at root level
 * - Bun: catalog or catalogs at root level, or workspaces.catalog
 */
export async function resolveCatalogDependencies(
  dependencies: Record<string, string> | undefined,
  workspaceRootDir: string,
): Promise<Record<string, string> | undefined> {
  if (!dependencies) {
    return undefined;
  }

  const log = useLogger();
  const rootManifestPath = path.join(workspaceRootDir, "package.json");
  const rootManifest = await readTypedJson<
    PackageManifest & {
      catalog?: Record<string, string>;
      catalogs?: Record<string, Record<string, string>>;
      workspaces?: {
        catalog?: Record<string, string>;
        catalogs?: Record<string, Record<string, string>>;
      };
    }
  >(rootManifestPath);

  // Try to find catalog in various locations (pnpm and Bun formats)
  const flatCatalog = rootManifest.catalog || rootManifest.workspaces?.catalog;
  const nestedCatalogs =
    rootManifest.catalogs || rootManifest.workspaces?.catalogs;

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
