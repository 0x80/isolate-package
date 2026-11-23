import { describe, expect, it } from "vitest";
import { pickReferencedCatalogs } from "./pick-referenced-catalogs";

const catalogs = {
  default: {
    react: { specifier: "^19.0.0", version: "19.0.0" },
    next: { specifier: "^16.0.0", version: "16.0.0" },
  },
  tools: {
    typescript: { specifier: "^5.0.0", version: "5.9.0" },
    vitest: { specifier: "^3.0.0", version: "3.2.0" },
  },
};

describe("pickReferencedCatalogs", () => {
  it("keeps only the entries the importers reference", () => {
    const result = pickReferencedCatalogs(catalogs, {
      ".": {
        specifiers: { react: "catalog:", typescript: "catalog:tools" },
        dependencies: { react: "19.0.0" },
        devDependencies: { typescript: "5.9.0" },
      },
    });

    expect(result).toEqual({
      default: { react: catalogs.default.react },
      tools: { typescript: catalogs.tools.typescript },
    });
  });

  it("reads catalog:default as the default catalog", () => {
    const result = pickReferencedCatalogs(catalogs, {
      ".": {
        specifiers: { next: "catalog:default" },
        optionalDependencies: { next: "16.0.0" },
      },
    });

    expect(result).toEqual({ default: { next: catalogs.default.next } });
  });

  it("merges the entries of several importers", () => {
    const result = pickReferencedCatalogs(catalogs, {
      ".": {
        specifiers: { react: "catalog:" },
        dependencies: { react: "19.0.0" },
      },
      "packages/shared": {
        specifiers: { next: "catalog:" },
        dependencies: { next: "16.0.0" },
      },
    });

    expect(result).toEqual({ default: catalogs.default });
  });

  /**
   * When dev dependencies are excluded, the importer mapping drops them but
   * leaves their specifiers in place, so a specifier alone does not make an
   * entry referenced.
   */
  it("ignores specifiers without a matching dependency", () => {
    const result = pickReferencedCatalogs(catalogs, {
      ".": {
        specifiers: { react: "catalog:", vitest: "catalog:tools" },
        dependencies: { react: "19.0.0" },
      },
    });

    expect(result).toEqual({ default: { react: catalogs.default.react } });
  });

  it("trims whitespace around the catalog name, as pnpm does", () => {
    const result = pickReferencedCatalogs(catalogs, {
      ".": {
        specifiers: { typescript: "catalog: tools ", react: "catalog: " },
        dependencies: { typescript: "5.9.0", react: "19.0.0" },
      },
    });

    expect(result).toEqual({
      default: { react: catalogs.default.react },
      tools: { typescript: catalogs.tools.typescript },
    });
  });

  it("returns undefined when no importer references a catalog entry", () => {
    const result = pickReferencedCatalogs(catalogs, {
      ".": {
        specifiers: { react: "^19.0.0" },
        dependencies: { react: "19.0.0" },
      },
    });

    expect(result).toBeUndefined();
  });
});
