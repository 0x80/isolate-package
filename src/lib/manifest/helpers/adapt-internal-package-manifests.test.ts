import { describe, it, expect, beforeEach, vi } from "vitest";
import type { PackageManifest, PackagesRegistry } from "~/lib/types";

/** Mock dependencies */
vi.mock("~/lib/package-manager", () => ({
  usePackageManager: vi.fn(),
}));

vi.mock("../io", () => ({
  writeManifest: vi.fn(),
}));

vi.mock("./adapt-manifest-internal-deps", () => ({
  adaptManifestInternalDeps: vi.fn(({ manifest }) => manifest),
}));

vi.mock("./resolve-catalog-dependencies", () => ({
  resolveCatalogDependencies: vi.fn((deps) => Promise.resolve(deps)),
}));

const { usePackageManager } = vi.mocked(
  await import("~/lib/package-manager"),
);

const { writeManifest } = vi.mocked(await import("../io"));

const { adaptInternalPackageManifests } = await import(
  "./adapt-internal-package-manifests"
);

describe("adaptInternalPackageManifests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePackageManager.mockReturnValue({
      name: "pnpm",
      version: "9.0.0",
      majorVersion: 9,
    });
  });

  function createRegistry(
    entries: Record<
      string,
      { rootRelativeDir: string; manifest: PackageManifest }
    >,
  ): PackagesRegistry {
    const registry: PackagesRegistry = {};
    for (const [name, { rootRelativeDir, manifest }] of Object.entries(
      entries,
    )) {
      registry[name] = {
        absoluteDir: `/workspace/${rootRelativeDir}`,
        rootRelativeDir,
        manifest,
      };
    }
    return registry;
  }

  it("should preserve scripts in internal dependency manifests", async () => {
    const manifest: PackageManifest = {
      name: "@repo/database",
      version: "1.0.0",
      scripts: {
        postinstall: "prisma generate",
        build: "tsc",
      },
      dependencies: {
        prisma: "^5.0.0",
      },
      devDependencies: {
        typescript: "^5.0.0",
      },
    };

    const packagesRegistry = createRegistry({
      "@repo/database": {
        rootRelativeDir: "packages/database",
        manifest,
      },
    });

    await adaptInternalPackageManifests({
      internalPackageNames: ["@repo/database"],
      packagesRegistry,
      isolateDir: "/output",
      forceNpm: false,
      workspaceRootDir: "/workspace",
    });

    expect(writeManifest).toHaveBeenCalledOnce();

    const writtenManifest = writeManifest.mock.calls[0]![1];

    expect(writtenManifest.scripts).toEqual({
      postinstall: "prisma generate",
      build: "tsc",
    });
  });

  it("should strip devDependencies from internal dependency manifests", async () => {
    const manifest: PackageManifest = {
      name: "@repo/shared",
      version: "1.0.0",
      dependencies: {
        lodash: "^4.0.0",
      },
      devDependencies: {
        vitest: "^1.0.0",
        typescript: "^5.0.0",
      },
    };

    const packagesRegistry = createRegistry({
      "@repo/shared": {
        rootRelativeDir: "packages/shared",
        manifest,
      },
    });

    await adaptInternalPackageManifests({
      internalPackageNames: ["@repo/shared"],
      packagesRegistry,
      isolateDir: "/output",
      forceNpm: false,
      workspaceRootDir: "/workspace",
    });

    const writtenManifest = writeManifest.mock.calls[0]![1];

    expect(writtenManifest.devDependencies).toBeUndefined();
  });
});
