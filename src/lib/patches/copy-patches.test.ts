import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { PackageManifest, PnpmSettings } from "#/lib/types";
import { copyPatches } from "./copy-patches";

/** Mock fs-extra */
vi.mock("fs-extra", () => ({
  default: {
    ensureDir: vi.fn(),
    existsSync: vi.fn(),
    copy: vi.fn(),
  },
}));

/** Mock the utils */
vi.mock("#/lib/utils", () => ({
  filterPatchedDependencies: vi.fn(),
  getIsolateRelativeLogPath: vi.fn((p: string) => p),
  getPackageName: vi.fn((spec: string) => {
    if (spec.startsWith("@")) {
      const parts = spec.split("@");
      return `@${parts[1] ?? ""}`;
    }
    return spec.split("@")[0] ?? "";
  }),
  getRootRelativeLogPath: vi.fn((p: string) => p),
  isRushWorkspace: vi.fn(() => false),
  readTypedJson: vi.fn(),
  readTypedJsonSync: vi.fn(),
  readTypedYamlSync: vi.fn(),
}));

/** Mock the package manager */
vi.mock("#/lib/package-manager", () => ({
  usePackageManager: vi.fn(() => ({ name: "pnpm", majorVersion: 9 })),
}));

/** Mock the pnpm lockfile readers */
vi.mock("pnpm_lockfile_file_v8", () => ({
  readWantedLockfile: vi.fn(() => Promise.resolve(null)),
  getLockfileImporterId: vi.fn(
    (root: string, dir: string) => dir.replace(`${root}/`, "") || ".",
  ),
}));

vi.mock("pnpm_lockfile_file_v9", () => ({
  readWantedLockfile: vi.fn(() => Promise.resolve(null)),
  getLockfileImporterId: vi.fn(
    (root: string, dir: string) => dir.replace(`${root}/`, "") || ".",
  ),
}));

const fs = vi.mocked((await import("fs-extra")).default);
const { filterPatchedDependencies, readTypedJson, readTypedYamlSync } =
  vi.mocked(await import("#/lib/utils"));
const { usePackageManager } = vi.mocked(await import("#/lib/package-manager"));
const { readWantedLockfile: readWantedLockfile_v9 } = vi.mocked(
  await import("pnpm_lockfile_file_v9"),
);

describe("copyPatches", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should return empty object when workspace root package.json cannot be read", async () => {
    readTypedYamlSync.mockImplementation(() => {
      throw new Error("File not found");
    });
    readTypedJson.mockRejectedValue(new Error("File not found"));

    const result = await copyPatches({
      workspaceRootDir: "/workspace",
      targetPackageDir: "/workspace/packages/test",
      internalDepPackageNames: [],
      targetPackageManifest: { name: "test", version: "1.0.0" },
      isolateDir: "/workspace/isolate",
      packagesRegistry: {},
      includeDevDependencies: false,
    });

    expect(result).toEqual({});
  });

  // Repeat these tests for each combination of config formats
  describe.for([
    "yamlOnly",
    "yamlAndJson",
    "jsonYamlEmpty",
    "jsonYamlError",
  ] as const)("valid config tests: %s", (mode) => {
    // Helper to set up mocks for the correct manifest file for this test scenario
    const mockManifest = (settings: PnpmSettings | undefined) => {
      switch (mode) {
        case "yamlOnly": {
          readTypedYamlSync.mockReturnValue(settings ?? {});
          readTypedJson.mockResolvedValue({ name: "test", version: "1.0.0" });
          break;
        }
        case "yamlAndJson": {
          readTypedYamlSync.mockReturnValue(settings ?? {});
          readTypedJson.mockResolvedValue({
            name: "test",
            version: "1.0.0",
            pnpm: settings,
          });
          break;
        }
        case "jsonYamlEmpty": {
          readTypedYamlSync.mockReturnValue({});
          readTypedJson.mockResolvedValue({
            name: "test",
            version: "1.0.0",
            pnpm: settings,
          });
          break;
        }
        case "jsonYamlError": {
          readTypedYamlSync.mockImplementation(() => {
            throw new Error("File not found");
          });
          readTypedJson.mockResolvedValue({
            name: "test",
            version: "1.0.0",
            pnpm: settings,
          });
          break;
        }
      }
    };

    it("should return empty object when no patchedDependencies in workspace root", async () => {
      mockManifest(undefined);

      const result = await copyPatches({
        workspaceRootDir: "/workspace",
        targetPackageDir: "/workspace/packages/test",
        internalDepPackageNames: [],
        targetPackageManifest: { name: "test", version: "1.0.0" },
        isolateDir: "/workspace/isolate",
        packagesRegistry: {},
        includeDevDependencies: false,
      });

      expect(result).toEqual({});
    });

    it("should return empty object when all patches are filtered out", async () => {
      mockManifest({
        patchedDependencies: {
          "lodash@4.17.21": "patches/lodash.patch",
        },
      });

      filterPatchedDependencies.mockReturnValue(undefined);

      const result = await copyPatches({
        workspaceRootDir: "/workspace",
        targetPackageDir: "/workspace/packages/test",
        internalDepPackageNames: [],
        targetPackageManifest: { name: "test", version: "1.0.0" },
        isolateDir: "/workspace/isolate",
        packagesRegistry: {},
        includeDevDependencies: false,
      });

      expect(result).toEqual({});
    });

    it("should copy patches for production dependencies", async () => {
      const targetManifest: PackageManifest = {
        name: "test",
        version: "1.0.0",
        dependencies: { lodash: "^4.0.0" },
      };

      mockManifest({
        patchedDependencies: {
          "lodash@4.17.21": "patches/lodash.patch",
        },
      });

      filterPatchedDependencies.mockReturnValue({
        "lodash@4.17.21": "patches/lodash.patch",
      });

      fs.existsSync.mockReturnValue(true);

      const result = await copyPatches({
        workspaceRootDir: "/workspace",
        targetPackageDir: "/workspace/packages/test",
        internalDepPackageNames: [],
        targetPackageManifest: targetManifest,
        isolateDir: "/workspace/isolate",
        packagesRegistry: {},
        includeDevDependencies: false,
      });

      expect(result).toEqual({
        "lodash@4.17.21": { path: "patches/lodash.patch", hash: "" },
      });
      /** Should preserve original folder structure */
      expect(fs.ensureDir).toHaveBeenCalledWith("/workspace/isolate/patches");
      expect(fs.copy).toHaveBeenCalledWith(
        "/workspace/patches/lodash.patch",
        "/workspace/isolate/patches/lodash.patch",
      );
    });

    it("should include dev dependency patches when includeDevDependencies is true", async () => {
      const targetManifest: PackageManifest = {
        name: "test",
        version: "1.0.0",
        devDependencies: { vitest: "^1.0.0" },
      };

      mockManifest({
        patchedDependencies: {
          "vitest@1.0.0": "patches/vitest.patch",
        },
      });

      filterPatchedDependencies.mockReturnValue({
        "vitest@1.0.0": "patches/vitest.patch",
      });

      fs.existsSync.mockReturnValue(true);

      const result = await copyPatches({
        workspaceRootDir: "/workspace",
        targetPackageDir: "/workspace/packages/test",
        internalDepPackageNames: [],
        targetPackageManifest: targetManifest,
        isolateDir: "/workspace/isolate",
        packagesRegistry: {},
        includeDevDependencies: true,
      });

      expect(result).toEqual({
        "vitest@1.0.0": { path: "patches/vitest.patch", hash: "" },
      });
      expect(filterPatchedDependencies).toHaveBeenCalledWith({
        patchedDependencies: { "vitest@1.0.0": "patches/vitest.patch" },
        targetPackageManifest: targetManifest,
        includeDevDependencies: true,
        reachableDependencyNames: expect.any(Set),
      });
      expect(fs.copy).toHaveBeenCalledWith(
        "/workspace/patches/vitest.patch",
        "/workspace/isolate/patches/vitest.patch",
      );
    });

    it("should skip missing patch files and log a warning", async () => {
      const targetManifest: PackageManifest = {
        name: "test",
        version: "1.0.0",
        dependencies: { lodash: "^4.0.0" },
      };

      mockManifest({
        patchedDependencies: {
          "lodash@4.17.21": "patches/lodash.patch",
        },
      });

      filterPatchedDependencies.mockReturnValue({
        "lodash@4.17.21": "patches/lodash.patch",
      });

      fs.existsSync.mockReturnValue(false);

      const result = await copyPatches({
        workspaceRootDir: "/workspace",
        targetPackageDir: "/workspace/packages/test",
        internalDepPackageNames: [],
        targetPackageManifest: targetManifest,
        isolateDir: "/workspace/isolate",
        packagesRegistry: {},
        includeDevDependencies: false,
      });

      expect(result).toEqual({});
      expect(fs.copy).not.toHaveBeenCalled();
    });

    it("should handle scoped package names correctly", async () => {
      const targetManifest: PackageManifest = {
        name: "test",
        version: "1.0.0",
        dependencies: { "@firebase/app": "^1.0.0" },
      };

      mockManifest({
        patchedDependencies: {
          "@firebase/app@1.2.3": "patches/firebase-app.patch",
        },
      });

      filterPatchedDependencies.mockReturnValue({
        "@firebase/app@1.2.3": "patches/firebase-app.patch",
      });

      fs.existsSync.mockReturnValue(true);

      const result = await copyPatches({
        workspaceRootDir: "/workspace",
        targetPackageDir: "/workspace/packages/test",
        internalDepPackageNames: [],
        targetPackageManifest: targetManifest,
        isolateDir: "/workspace/isolate",
        packagesRegistry: {},
        includeDevDependencies: false,
      });

      expect(result).toEqual({
        "@firebase/app@1.2.3": { path: "patches/firebase-app.patch", hash: "" },
      });
    });

    it("should preserve nested folder structure when copying patches", async () => {
      const targetManifest: PackageManifest = {
        name: "test",
        version: "1.0.0",
        dependencies: { "pkg-a": "^1.0.0", "pkg-b": "^1.0.0" },
      };

      mockManifest({
        patchedDependencies: {
          "pkg-a@1.0.0": "patches/v1/fix.patch",
          "pkg-b@1.0.0": "patches/v2/fix.patch",
        },
      });

      filterPatchedDependencies.mockReturnValue({
        "pkg-a@1.0.0": "patches/v1/fix.patch",
        "pkg-b@1.0.0": "patches/v2/fix.patch",
      });

      fs.existsSync.mockReturnValue(true);

      const result = await copyPatches({
        workspaceRootDir: "/workspace",
        targetPackageDir: "/workspace/packages/test",
        internalDepPackageNames: [],
        targetPackageManifest: targetManifest,
        isolateDir: "/workspace/isolate",
        packagesRegistry: {},
        includeDevDependencies: false,
      });

      /** Should preserve original paths without renaming */
      expect(result).toEqual({
        "pkg-a@1.0.0": { path: "patches/v1/fix.patch", hash: "" },
        "pkg-b@1.0.0": { path: "patches/v2/fix.patch", hash: "" },
      });
      expect(fs.copy).toHaveBeenCalledTimes(2);
      expect(fs.copy).toHaveBeenCalledWith(
        "/workspace/patches/v1/fix.patch",
        "/workspace/isolate/patches/v1/fix.patch",
      );
      expect(fs.copy).toHaveBeenCalledWith(
        "/workspace/patches/v2/fix.patch",
        "/workspace/isolate/patches/v2/fix.patch",
      );
    });

    it("should preserve deeply nested patch paths", async () => {
      const targetManifest: PackageManifest = {
        name: "test",
        version: "1.0.0",
        dependencies: { lodash: "^4.0.0" },
      };

      mockManifest({
        patchedDependencies: {
          "lodash@4.17.21": "some/nested/path/lodash.patch",
        },
      });

      filterPatchedDependencies.mockReturnValue({
        "lodash@4.17.21": "some/nested/path/lodash.patch",
      });

      fs.existsSync.mockReturnValue(true);

      const result = await copyPatches({
        workspaceRootDir: "/workspace",
        targetPackageDir: "/workspace/packages/test",
        internalDepPackageNames: [],
        targetPackageManifest: targetManifest,
        isolateDir: "/workspace/isolate",
        packagesRegistry: {},
        includeDevDependencies: false,
      });

      /** The path should preserve the original directory structure */
      expect(result).toEqual({
        "lodash@4.17.21": { path: "some/nested/path/lodash.patch", hash: "" },
      });
      expect(fs.ensureDir).toHaveBeenCalledWith(
        "/workspace/isolate/some/nested/path",
      );
      expect(fs.copy).toHaveBeenCalledWith(
        "/workspace/some/nested/path/lodash.patch",
        "/workspace/isolate/some/nested/path/lodash.patch",
      );
    });

    it("should copy multiple patches correctly", async () => {
      const targetManifest: PackageManifest = {
        name: "test",
        version: "1.0.0",
        dependencies: {
          lodash: "^4.0.0",
          "@firebase/app": "^1.0.0",
        },
      };

      mockManifest({
        patchedDependencies: {
          "lodash@4.17.21": "patches/lodash.patch",
          "@firebase/app@1.2.3": "patches/firebase-app.patch",
        },
      });

      filterPatchedDependencies.mockReturnValue({
        "lodash@4.17.21": "patches/lodash.patch",
        "@firebase/app@1.2.3": "patches/firebase-app.patch",
      });

      fs.existsSync.mockReturnValue(true);

      const result = await copyPatches({
        workspaceRootDir: "/workspace",
        targetPackageDir: "/workspace/packages/test",
        internalDepPackageNames: [],
        targetPackageManifest: targetManifest,
        isolateDir: "/workspace/isolate",
        packagesRegistry: {},
        includeDevDependencies: false,
      });

      expect(result).toEqual({
        "lodash@4.17.21": { path: "patches/lodash.patch", hash: "" },
        "@firebase/app@1.2.3": { path: "patches/firebase-app.patch", hash: "" },
      });
      expect(fs.copy).toHaveBeenCalledTimes(2);
    });
  });

  it("should read top-level patchedDependencies for Bun projects", async () => {
    usePackageManager.mockReturnValue({
      name: "bun",
      majorVersion: 1,
      version: "1.2.0",
      packageManagerString: "bun@1.2.0",
    });

    const targetManifest: PackageManifest = {
      name: "test",
      version: "1.0.0",
      dependencies: { lodash: "^4.0.0" },
    };

    /** No patches in pnpm-workspace.yaml, so it falls back to package.json */
    readTypedYamlSync.mockReturnValue({});

    readTypedJson.mockResolvedValue({
      name: "root",
      version: "1.0.0",
      patchedDependencies: {
        "lodash@4.17.21": "patches/lodash.patch",
      },
    } as PackageManifest);

    filterPatchedDependencies.mockReturnValue({
      "lodash@4.17.21": "patches/lodash.patch",
    });

    fs.existsSync.mockReturnValue(true);

    const result = await copyPatches({
      workspaceRootDir: "/workspace",
      targetPackageDir: "/workspace/packages/test",
      internalDepPackageNames: [],
      targetPackageManifest: targetManifest,
      isolateDir: "/workspace/isolate",
      packagesRegistry: {},
      includeDevDependencies: false,
    });

    expect(result).toEqual({
      "lodash@4.17.21": { path: "patches/lodash.patch", hash: "" },
    });
    expect(fs.copy).toHaveBeenCalledWith(
      "/workspace/patches/lodash.patch",
      "/workspace/isolate/patches/lodash.patch",
    );
  });

  it("should pass reachable transitive dep names from internal packages to the filter (regression: issue #167)", async () => {
    /**
     * Target `consumer` depends on internal `firebase-package`, which in turn
     * depends on `tslib`. A patch for `tslib@2.0.0` declared at the workspace
     * root must reach the filter with `tslib` in `reachableDependencyNames`
     * so it can be preserved even though `consumer` doesn't list it directly.
     */
    const consumerManifest: PackageManifest = {
      name: "consumer",
      version: "1.0.0",
      dependencies: { "firebase-package": "file:./packages/firebase-package" },
    };

    readTypedYamlSync.mockReturnValue({
      patchedDependencies: {
        "tslib@2.0.0": "patches/tslib@2.0.0.patch",
      },
    });
    readTypedJson.mockResolvedValue({
      name: "root",
      version: "1.0.0",
    } as PackageManifest);

    filterPatchedDependencies.mockReturnValue({
      "tslib@2.0.0": "patches/tslib@2.0.0.patch",
    });

    fs.existsSync.mockReturnValue(true);

    usePackageManager.mockReturnValue({
      name: "pnpm",
      majorVersion: 9,
      version: "9.0.0",
      packageManagerString: "pnpm@9.0.0",
    });

    const result = await copyPatches({
      workspaceRootDir: "/workspace",
      targetPackageDir: "/workspace/packages/test",
      internalDepPackageNames: [],
      targetPackageManifest: consumerManifest,
      isolateDir: "/workspace/isolate",
      packagesRegistry: {
        "firebase-package": {
          absoluteDir: "/workspace/packages/firebase-package",
          rootRelativeDir: "packages/firebase-package",
          manifest: {
            name: "firebase-package",
            version: "1.0.0",
            dependencies: { tslib: "^2.0.0" },
          },
        },
      },
      includeDevDependencies: false,
    });

    expect(result).toEqual({
      "tslib@2.0.0": { path: "patches/tslib@2.0.0.patch", hash: "" },
    });

    const filterCall = filterPatchedDependencies.mock.calls[0]?.[0];
    expect(filterCall).toBeDefined();
    const reachable = filterCall!.reachableDependencyNames;
    expect(reachable).toBeInstanceOf(Set);
    expect(reachable!.has("firebase-package")).toBe(true);
    expect(reachable!.has("tslib")).toBe(true);
  });

  it("should pick up deep external-to-external transitives from the pnpm lockfile (regression: issue #167 follow-up)", async () => {
    /**
     * Target depends on `@react-pdf/renderer` (external). The patched
     * `@react-pdf/render` is only a transitive of `@react-pdf/renderer`. The
     * manifest walker can't see it because it can't open external manifests,
     * so the lockfile walker has to surface it.
     */
    const targetManifest: PackageManifest = {
      name: "consumer",
      version: "1.0.0",
      dependencies: { "@react-pdf/renderer": "^4.0.0" },
    };

    readTypedYamlSync.mockReturnValue({
      patchedDependencies: {
        "@react-pdf/render@4.3.0": "patches/@react-pdf__render@4.3.0.patch",
      },
    });
    readTypedJson.mockResolvedValue({
      name: "root",
      version: "1.0.0",
    } as PackageManifest);

    filterPatchedDependencies.mockReturnValue({
      "@react-pdf/render@4.3.0": "patches/@react-pdf__render@4.3.0.patch",
    });

    fs.existsSync.mockReturnValue(true);

    usePackageManager.mockReturnValue({
      name: "pnpm",
      majorVersion: 9,
      version: "9.0.0",
      packageManagerString: "pnpm@9.0.0",
    });

    /**
     * Fake v9 lockfile: target importer depends on @react-pdf/renderer, which
     * has @react-pdf/render as its only resolved dep.
     */
    readWantedLockfile_v9.mockResolvedValue({
      lockfileVersion: "9.0",
      importers: {
        "packages/consumer": {
          specifiers: { "@react-pdf/renderer": "^4.0.0" },
          dependencies: { "@react-pdf/renderer": "4.0.0" },
        },
      },
      packages: {
        "@react-pdf/renderer@4.0.0": {
          resolution: { integrity: "sha512-x" },
          dependencies: { "@react-pdf/render": "4.3.0" },
        },
        "@react-pdf/render@4.3.0": {
          resolution: { integrity: "sha512-y" },
        },
      },
    } as unknown as Awaited<ReturnType<typeof readWantedLockfile_v9>>);

    const result = await copyPatches({
      workspaceRootDir: "/workspace",
      targetPackageDir: "/workspace/packages/consumer",
      internalDepPackageNames: [],
      targetPackageManifest: targetManifest,
      isolateDir: "/workspace/isolate",
      packagesRegistry: {},
      includeDevDependencies: false,
    });

    expect(result).toEqual({
      "@react-pdf/render@4.3.0": {
        path: "patches/@react-pdf__render@4.3.0.patch",
        hash: "",
      },
    });

    const filterCall = filterPatchedDependencies.mock.calls[0]?.[0];
    expect(filterCall).toBeDefined();
    const reachable = filterCall!.reachableDependencyNames;
    expect(reachable).toBeInstanceOf(Set);
    expect(reachable!.has("@react-pdf/renderer")).toBe(true);
    expect(reachable!.has("@react-pdf/render")).toBe(true);
  });

  it("should read the patch hash from the pnpm 11 string lockfile format (regression: issue #201)", async () => {
    /**
     * pnpm 11 simplified the lockfile `patchedDependencies` format from
     * `Record<string, { path, hash }>` to `Record<string, string>` (selector to
     * hash). The hash must be read from the bare string, otherwise it ends up
     * empty and pnpm rejects the isolated install with
     * ERR_PNPM_LOCKFILE_CONFIG_MISMATCH.
     */
    const targetManifest: PackageManifest = {
      name: "test",
      version: "1.0.0",
      dependencies: { lodash: "^4.0.0" },
    };

    readTypedYamlSync.mockReturnValue({
      patchedDependencies: {
        "lodash@4.17.21": "patches/lodash.patch",
      },
    });
    readTypedJson.mockResolvedValue({
      name: "root",
      version: "1.0.0",
    } as PackageManifest);

    filterPatchedDependencies.mockReturnValue({
      "lodash@4.17.21": "patches/lodash.patch",
    });

    fs.existsSync.mockReturnValue(true);

    usePackageManager.mockReturnValue({
      name: "pnpm",
      majorVersion: 9,
      version: "9.0.0",
      packageManagerString: "pnpm@9.0.0",
    });

    readWantedLockfile_v9.mockResolvedValue({
      lockfileVersion: "9.0",
      patchedDependencies: {
        "lodash@4.17.21": "sha256-abc123",
      },
    } as unknown as Awaited<ReturnType<typeof readWantedLockfile_v9>>);

    const result = await copyPatches({
      workspaceRootDir: "/workspace",
      targetPackageDir: "/workspace/packages/test",
      internalDepPackageNames: [],
      targetPackageManifest: targetManifest,
      isolateDir: "/workspace/isolate",
      packagesRegistry: {},
      includeDevDependencies: false,
    });

    expect(result).toEqual({
      "lodash@4.17.21": {
        path: "patches/lodash.patch",
        hash: "sha256-abc123",
      },
    });
  });

  it("should read the patch hash from the pnpm <=10 object lockfile format (regression: issue #201)", async () => {
    const targetManifest: PackageManifest = {
      name: "test",
      version: "1.0.0",
      dependencies: { lodash: "^4.0.0" },
    };

    readTypedYamlSync.mockReturnValue({
      patchedDependencies: {
        "lodash@4.17.21": "patches/lodash.patch",
      },
    });
    readTypedJson.mockResolvedValue({
      name: "root",
      version: "1.0.0",
    } as PackageManifest);

    filterPatchedDependencies.mockReturnValue({
      "lodash@4.17.21": "patches/lodash.patch",
    });

    fs.existsSync.mockReturnValue(true);

    usePackageManager.mockReturnValue({
      name: "pnpm",
      majorVersion: 9,
      version: "9.0.0",
      packageManagerString: "pnpm@9.0.0",
    });

    readWantedLockfile_v9.mockResolvedValue({
      lockfileVersion: "9.0",
      patchedDependencies: {
        "lodash@4.17.21": {
          path: "patches/lodash.patch",
          hash: "sha256-def456",
        },
      },
    } as unknown as Awaited<ReturnType<typeof readWantedLockfile_v9>>);

    const result = await copyPatches({
      workspaceRootDir: "/workspace",
      targetPackageDir: "/workspace/packages/test",
      internalDepPackageNames: [],
      targetPackageManifest: targetManifest,
      isolateDir: "/workspace/isolate",
      packagesRegistry: {},
      includeDevDependencies: false,
    });

    expect(result).toEqual({
      "lodash@4.17.21": {
        path: "patches/lodash.patch",
        hash: "sha256-def456",
      },
    });
  });
});
