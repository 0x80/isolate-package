/**
 * A pnpm catalog snapshot as stored in the lockfile: a map of catalog name
 * (e.g. "default") to a map of dependency name to its resolved entry. The
 * lockfile object is a union of the v8 and v9 reader types and the v8 one
 * predates catalogs, so we model the shape locally.
 */
export type CatalogSnapshots = Record<
  string,
  Record<string, { specifier: string; version: string }>
>;

/** The parts of a lockfile importer that tell which catalog entries it uses */
type CatalogImporter = {
  specifiers?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
};

const CATALOG_PROTOCOL = "catalog:";

/**
 * Narrow a lockfile catalogs snapshot to the entries that the given importers
 * reference through a "catalog:" specifier. `catalog:` and `catalog:default`
 * both name the default catalog.
 *
 * With catalog pruning enabled (`cleanupUnusedCatalogs`, or its newer name
 * `catalogPrune`), pnpm 12 refuses a frozen install when the snapshot holds
 * entries that no importer uses (see issue #218). Returns undefined when no
 * entry remains, so the isolated lockfile omits the field as pnpm would.
 */
export function pickReferencedCatalogs(
  catalogs: CatalogSnapshots,
  importers: Record<string, CatalogImporter>,
): CatalogSnapshots | undefined {
  const picked: CatalogSnapshots = {};

  for (const importer of Object.values(importers)) {
    const dependencyNames = [
      importer.dependencies,
      importer.devDependencies,
      importer.optionalDependencies,
    ].flatMap((dependencies) => Object.keys(dependencies ?? {}));

    for (const dependencyName of dependencyNames) {
      const specifier = importer.specifiers?.[dependencyName];

      if (!specifier?.startsWith(CATALOG_PROTOCOL)) {
        continue;
      }

      const catalogName = specifier.slice(CATALOG_PROTOCOL.length) || "default";
      const entry = catalogs[catalogName]?.[dependencyName];

      if (entry) {
        picked[catalogName] = {
          ...picked[catalogName],
          [dependencyName]: entry,
        };
      }
    }
  }

  return Object.keys(picked).length > 0 ? picked : undefined;
}
