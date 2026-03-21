import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { PackageManifest, PnpmSettings } from "~/lib/types";
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
vi.mock("~/lib/utils", () => ({
  filterPatchedDependencies: vi.fn(),
  getIsolateRelativeLogPath: vi.fn((p: string) => p),
  getRootRelativeLogPath: vi.fn((p: string) => p),
  isRushWorkspace: vi.fn(() => false),
  readTypedJson: vi.fn(),
  readTypedYamlSync: vi.fn(),
}));

/** Mock the package manager */
vi.mock("~/lib/package-manager", () => ({
  usePackageManager: vi.fn(() => ({ majorVersion: 9 })),
}));

/** Mock the pnpm lockfile readers */
vi.mock("pnpm_lockfile_file_v8", () => ({
  readWantedLockfile: vi.fn(() => Promise.resolve(null)),
}));

vi.mock("pnpm_lockfile_file_v9", () => ({
  readWantedLockfile: vi.fn(() => Promise.resolve(null)),
}));

/** Mock the logger */
vi.mock("~/lib/logger", () => ({
  useLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

const fs = vi.mocked((await import("fs-extra")).default);
const { filterPatchedDependencies, readTypedJson, readTypedYamlSync } =
  vi.mocked(await import("~/lib/utils"));

describe("copyPatches", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const mockJsonSettings = (settings: PnpmSettings | undefined) => {
    readTypedJson.mockResolvedValue({
      name: "root",
      version: "1.0.0",
      pnpm: settings,
    });
  };

  it("should return empty object when workspace root package.json cannot be read", async () => {
    readTypedYamlSync.mockImplementation(() => {
      throw new Error("File not found");
    });
    readTypedJson.mockRejectedValue(new Error("File not found"));

    const result = await copyPatches({
      workspaceRootDir: "/workspace",
      targetPackageManifest: { name: "test", version: "1.0.0" },
      isolateDir: "/workspace/isolate",
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
        targetPackageManifest: { name: "test", version: "1.0.0" },
        isolateDir: "/workspace/isolate",
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
        targetPackageManifest: { name: "test", version: "1.0.0" },
        isolateDir: "/workspace/isolate",
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
        targetPackageManifest: targetManifest,
        isolateDir: "/workspace/isolate",
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
        targetPackageManifest: targetManifest,
        isolateDir: "/workspace/isolate",
        includeDevDependencies: true,
      });

      expect(result).toEqual({
        "vitest@1.0.0": { path: "patches/vitest.patch", hash: "" },
      });
      expect(filterPatchedDependencies).toHaveBeenCalledWith({
        patchedDependencies: { "vitest@1.0.0": "patches/vitest.patch" },
        targetPackageManifest: targetManifest,
        includeDevDependencies: true,
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
        targetPackageManifest: targetManifest,
        isolateDir: "/workspace/isolate",
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
        targetPackageManifest: targetManifest,
        isolateDir: "/workspace/isolate",
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
        targetPackageManifest: targetManifest,
        isolateDir: "/workspace/isolate",
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
        targetPackageManifest: targetManifest,
        isolateDir: "/workspace/isolate",
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
        targetPackageManifest: targetManifest,
        isolateDir: "/workspace/isolate",
        includeDevDependencies: false,
      });

      expect(result).toEqual({
        "lodash@4.17.21": { path: "patches/lodash.patch", hash: "" },
        "@firebase/app@1.2.3": { path: "patches/firebase-app.patch", hash: "" },
      });
      expect(fs.copy).toHaveBeenCalledTimes(2);
    });
  });
});
