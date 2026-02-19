import { afterEach, describe, expect, it, vi } from "vitest";
import type { PackageManifest, PackagesRegistry } from "~/lib/types";
import { listInternalPackages } from "./list-internal-packages";

const mockWarn = vi.fn();

vi.mock("~/lib/logger", () => ({
  useLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: mockWarn,
    error: vi.fn(),
  }),
}));

/** Helper to create a minimal WorkspacePackageInfo entry */
function entry(manifest: PackageManifest) {
  return {
    absoluteDir: `/workspace/packages/${manifest.name}`,
    rootRelativeDir: `packages/${manifest.name}`,
    manifest,
  };
}

describe("listInternalPackages", () => {
  afterEach(() => {
    mockWarn.mockClear();
  });

  it("should return an empty array when there are no internal dependencies", () => {
    const manifest: PackageManifest = {
      name: "app",
      version: "1.0.0",
      dependencies: { lodash: "^4.0.0" },
    };

    const registry: PackagesRegistry = {
      app: entry(manifest),
    };

    const result = listInternalPackages(manifest, registry);
    expect(result).toEqual([]);
    expect(mockWarn).not.toHaveBeenCalled();
  });

  it("should resolve a simple internal dependency", () => {
    const utilsManifest: PackageManifest = {
      name: "utils",
      version: "1.0.0",
    };

    const appManifest: PackageManifest = {
      name: "app",
      version: "1.0.0",
      dependencies: { utils: "workspace:*", lodash: "^4.0.0" },
    };

    const registry: PackagesRegistry = {
      app: entry(appManifest),
      utils: entry(utilsManifest),
    };

    const result = listInternalPackages(appManifest, registry);
    expect(result).toEqual(["utils"]);
    expect(mockWarn).not.toHaveBeenCalled();
  });

  it("should recursively resolve transitive internal dependencies", () => {
    const coreManifest: PackageManifest = {
      name: "core",
      version: "1.0.0",
    };

    const utilsManifest: PackageManifest = {
      name: "utils",
      version: "1.0.0",
      dependencies: { core: "workspace:*" },
    };

    const appManifest: PackageManifest = {
      name: "app",
      version: "1.0.0",
      dependencies: { utils: "workspace:*" },
    };

    const registry: PackagesRegistry = {
      app: entry(appManifest),
      utils: entry(utilsManifest),
      core: entry(coreManifest),
    };

    const result = listInternalPackages(appManifest, registry);
    expect(result).toEqual(expect.arrayContaining(["utils", "core"]));
    expect(result).toHaveLength(2);
    expect(mockWarn).not.toHaveBeenCalled();
  });

  it("should deduplicate diamond dependencies without warning", () => {
    const coreManifest: PackageManifest = {
      name: "core",
      version: "1.0.0",
    };

    const utilsManifest: PackageManifest = {
      name: "utils",
      version: "1.0.0",
      dependencies: { core: "workspace:*" },
    };

    const helpersManifest: PackageManifest = {
      name: "helpers",
      version: "1.0.0",
      dependencies: { core: "workspace:*" },
    };

    const appManifest: PackageManifest = {
      name: "app",
      version: "1.0.0",
      dependencies: { utils: "workspace:*", helpers: "workspace:*" },
    };

    const registry: PackagesRegistry = {
      app: entry(appManifest),
      utils: entry(utilsManifest),
      helpers: entry(helpersManifest),
      core: entry(coreManifest),
    };

    const result = listInternalPackages(appManifest, registry);
    expect(result).toEqual(
      expect.arrayContaining(["utils", "helpers", "core"]),
    );
    expect(result).toHaveLength(3);
    expect(mockWarn).not.toHaveBeenCalled();
  });

  it("should detect a two-node cycle and log a warning", () => {
    /** A depends on B, B depends on A */
    const bManifest: PackageManifest = {
      name: "b",
      version: "1.0.0",
      dependencies: { a: "workspace:*" },
    };

    const aManifest: PackageManifest = {
      name: "a",
      version: "1.0.0",
      dependencies: { b: "workspace:*" },
    };

    const appManifest: PackageManifest = {
      name: "app",
      version: "1.0.0",
      dependencies: { a: "workspace:*" },
    };

    const registry: PackagesRegistry = {
      app: entry(appManifest),
      a: entry(aManifest),
      b: entry(bManifest),
    };

    const result = listInternalPackages(appManifest, registry);
    expect(result).toEqual(expect.arrayContaining(["a", "b"]));
    expect(result).toHaveLength(2);
    expect(mockWarn).toHaveBeenCalledWith(
      expect.stringContaining("Circular dependency detected"),
    );
  });

  it("should detect a longer cycle and log a warning", () => {
    /** A depends on B, B depends on C, C depends on B */
    const cManifest: PackageManifest = {
      name: "c",
      version: "1.0.0",
      dependencies: { b: "workspace:*" },
    };

    const bManifest: PackageManifest = {
      name: "b",
      version: "1.0.0",
      dependencies: { c: "workspace:*" },
    };

    const aManifest: PackageManifest = {
      name: "a",
      version: "1.0.0",
      dependencies: { b: "workspace:*" },
    };

    const appManifest: PackageManifest = {
      name: "app",
      version: "1.0.0",
      dependencies: { a: "workspace:*" },
    };

    const registry: PackagesRegistry = {
      app: entry(appManifest),
      a: entry(aManifest),
      b: entry(bManifest),
      c: entry(cManifest),
    };

    const result = listInternalPackages(appManifest, registry);
    expect(result).toEqual(expect.arrayContaining(["a", "b", "c"]));
    expect(result).toHaveLength(3);
    expect(mockWarn).toHaveBeenCalledWith(
      expect.stringContaining("Circular dependency detected"),
    );
  });

  it("should include devDependencies and handle cycles in them", () => {
    const devLibManifest: PackageManifest = {
      name: "dev-lib",
      version: "1.0.0",
      dependencies: { app: "workspace:*" },
    };

    const appManifest: PackageManifest = {
      name: "app",
      version: "1.0.0",
      dependencies: { lodash: "^4.0.0" },
      devDependencies: { "dev-lib": "workspace:*" },
    };

    const registry: PackagesRegistry = {
      app: entry(appManifest),
      "dev-lib": entry(devLibManifest),
    };

    /** Without devDependencies — should not find dev-lib */
    const withoutDev = listInternalPackages(appManifest, registry);
    expect(withoutDev).toEqual([]);
    expect(mockWarn).not.toHaveBeenCalled();

    /** With devDependencies — should find dev-lib and detect the cycle back to app */
    const withDev = listInternalPackages(appManifest, registry, {
      includeDevDependencies: true,
    });
    expect(withDev).toEqual(["dev-lib"]);
    expect(mockWarn).toHaveBeenCalledWith(
      expect.stringContaining("Circular dependency detected"),
    );
  });

  it("should handle name clash where internal package shares a name with an external dependency", () => {
    /**
     * Simulates the scenario from issue #138: an internal package named
     * "config" exists in the workspace, while another package depends on the
     * npm "config" package. Because both resolve to the same name in the
     * registry, the tool follows a false internal reference and hits a cycle.
     */
    const configManifest: PackageManifest = {
      name: "config",
      version: "1.0.0",
    };

    const serverManifest: PackageManifest = {
      name: "server",
      version: "1.0.0",
      /** References the npm "config" package, not the workspace one */
      dependencies: { config: "^3.0.0" },
    };

    const appManifest: PackageManifest = {
      name: "app",
      version: "1.0.0",
      dependencies: { server: "workspace:*", config: "workspace:*" },
    };

    const registry: PackagesRegistry = {
      app: entry(appManifest),
      server: entry(serverManifest),
      config: entry(configManifest),
    };

    const result = listInternalPackages(appManifest, registry);
    expect(result).toEqual(
      expect.arrayContaining(["server", "config"]),
    );
    expect(result).toHaveLength(2);
    /** "config" is already visited when server references it — no cycle */
    expect(mockWarn).not.toHaveBeenCalled();
  });
});
