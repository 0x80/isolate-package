import { describe, it, expect } from "vitest";
import type { ProjectSnapshot } from "pnpm_lockfile_file_v8";
import { pnpmMapImporter } from "./pnpm-map-importer";

describe("pnpmMapImporter", () => {
  const directoryByPackageName: Record<string, string> = {
    shared: "packages/shared",
    utils: "packages/utils",
  };

  it("should remap link: dependencies to correct relative paths", () => {
    const importer: ProjectSnapshot = {
      specifiers: { shared: "workspace:*" },
      dependencies: {
        shared: "link:../shared",
      },
    };

    const result = pnpmMapImporter("packages/my-app", importer, {
      includeDevDependencies: false,
      directoryByPackageName,
    });

    expect(result.dependencies?.["shared"]).toBe("link:../shared");
  });

  it("should preserve non-link dependencies unchanged", () => {
    const importer: ProjectSnapshot = {
      specifiers: { lodash: "^4.17.21", shared: "workspace:*" },
      dependencies: {
        lodash: "4.17.21",
        shared: "link:../shared",
      },
    };

    const result = pnpmMapImporter("packages/my-app", importer, {
      includeDevDependencies: false,
      directoryByPackageName,
    });

    expect(result.dependencies?.["lodash"]).toBe("4.17.21");
  });

  it("should remove link: entries for non-internal packages", () => {
    const importer: ProjectSnapshot = {
      specifiers: { shared: "workspace:*", "not-internal": "workspace:*" },
      dependencies: {
        shared: "link:../shared",
        "not-internal": "link:../not-internal",
      },
    };

    const result = pnpmMapImporter("packages/my-app", importer, {
      includeDevDependencies: false,
      directoryByPackageName,
    });

    expect(result.dependencies?.["shared"]).toBeDefined();
    expect(result.dependencies?.["not-internal"]).toBeUndefined();
  });

  it("should exclude devDependencies when includeDevDependencies is false", () => {
    const importer: ProjectSnapshot = {
      specifiers: { shared: "workspace:*", vitest: "^1.0.0" },
      dependencies: {
        shared: "link:../shared",
      },
      devDependencies: {
        vitest: "1.0.0",
      },
    };

    const result = pnpmMapImporter("packages/my-app", importer, {
      includeDevDependencies: false,
      directoryByPackageName,
    });

    expect(result.devDependencies).toBeUndefined();
  });

  it("should include devDependencies when includeDevDependencies is true", () => {
    const importer: ProjectSnapshot = {
      specifiers: {
        shared: "workspace:*",
        vitest: "^1.0.0",
        utils: "workspace:*",
      },
      dependencies: {
        shared: "link:../shared",
      },
      devDependencies: {
        vitest: "1.0.0",
        utils: "link:../utils",
      },
    };

    const result = pnpmMapImporter("packages/my-app", importer, {
      includeDevDependencies: true,
      directoryByPackageName,
    });

    expect(result.devDependencies?.["vitest"]).toBe("1.0.0");
    expect(result.devDependencies?.["utils"]).toBeDefined();
  });

  it("should handle root importer path correctly", () => {
    const importer: ProjectSnapshot = {
      specifiers: { shared: "workspace:*" },
      dependencies: {
        shared: "link:packages/shared",
      },
    };

    const result = pnpmMapImporter(".", importer, {
      includeDevDependencies: false,
      directoryByPackageName,
    });

    expect(result.dependencies?.["shared"]).toBe("link:./packages/shared");
  });

  it("should handle nested importer paths producing correct relative paths", () => {
    const importer: ProjectSnapshot = {
      specifiers: { utils: "workspace:*" },
      dependencies: {
        utils: "link:../utils",
      },
    };

    const result = pnpmMapImporter("packages/shared", importer, {
      includeDevDependencies: false,
      directoryByPackageName,
    });

    expect(result.dependencies?.["utils"]).toBe("link:../utils");
  });

  it("should pass through other ProjectSnapshot fields via rest", () => {
    const importer: ProjectSnapshot = {
      specifiers: { lodash: "^4.17.21" },
      dependencies: {
        lodash: "4.17.21",
      },
    };

    const result = pnpmMapImporter(".", importer, {
      includeDevDependencies: false,
      directoryByPackageName,
    });

    expect(result.specifiers).toEqual({ lodash: "^4.17.21" });
  });

  it("should handle undefined dependencies gracefully", () => {
    const importer: ProjectSnapshot = {
      specifiers: {},
    };

    const result = pnpmMapImporter(".", importer, {
      includeDevDependencies: true,
      directoryByPackageName,
    });

    expect(result.dependencies).toBeUndefined();
    expect(result.devDependencies).toBeUndefined();
  });

  it("should add ./ prefix for relative paths that don't start with .", () => {
    const importer: ProjectSnapshot = {
      specifiers: { shared: "workspace:*" },
      dependencies: {
        shared: "link:packages/shared",
      },
    };

    const result = pnpmMapImporter(".", importer, {
      includeDevDependencies: false,
      directoryByPackageName,
    });

    expect(result.dependencies?.["shared"]).toMatch(/^link:\.\//);
  });
});
