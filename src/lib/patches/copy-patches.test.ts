import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { PackageManifest } from "~/lib/types";
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

const fs = vi.mocked((await import("fs-extra")).default);
const { filterPatchedDependencies, readTypedJson } = vi.mocked(
  await import("~/lib/utils"),
);

describe("copyPatches", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should return empty object when workspace root package.json cannot be read", async () => {
    readTypedJson.mockRejectedValue(new Error("File not found"));

    const result = await copyPatches({
      workspaceRootDir: "/workspace",
      targetPackageManifest: { name: "test", version: "1.0.0" },
      isolateDir: "/workspace/isolate",
      includeDevDependencies: false,
    });

    expect(result).toEqual({});
  });

  it("should return empty object when no patchedDependencies in workspace root", async () => {
    readTypedJson.mockResolvedValue({
      name: "root",
      version: "1.0.0",
    } as PackageManifest);

    const result = await copyPatches({
      workspaceRootDir: "/workspace",
      targetPackageManifest: { name: "test", version: "1.0.0" },
      isolateDir: "/workspace/isolate",
      includeDevDependencies: false,
    });

    expect(result).toEqual({});
  });

  it("should return empty object when all patches are filtered out", async () => {
    readTypedJson.mockResolvedValue({
      name: "root",
      version: "1.0.0",
      pnpm: {
        patchedDependencies: {
          "lodash@4.17.21": "patches/lodash.patch",
        },
      },
    } as PackageManifest);
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

    readTypedJson.mockResolvedValue({
      name: "root",
      version: "1.0.0",
      pnpm: {
        patchedDependencies: {
          "lodash@4.17.21": "patches/lodash.patch",
        },
      },
    } as PackageManifest);

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

    readTypedJson.mockResolvedValue({
      name: "root",
      version: "1.0.0",
      pnpm: {
        patchedDependencies: {
          "vitest@1.0.0": "patches/vitest.patch",
        },
      },
    } as PackageManifest);

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

    readTypedJson.mockResolvedValue({
      name: "root",
      version: "1.0.0",
      pnpm: {
        patchedDependencies: {
          "lodash@4.17.21": "patches/lodash.patch",
        },
      },
    } as PackageManifest);

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

    readTypedJson.mockResolvedValue({
      name: "root",
      version: "1.0.0",
      pnpm: {
        patchedDependencies: {
          "@firebase/app@1.2.3": "patches/firebase-app.patch",
        },
      },
    } as PackageManifest);

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

    readTypedJson.mockResolvedValue({
      name: "root",
      version: "1.0.0",
      pnpm: {
        patchedDependencies: {
          "pkg-a@1.0.0": "patches/v1/fix.patch",
          "pkg-b@1.0.0": "patches/v2/fix.patch",
        },
      },
    } as PackageManifest);

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

    readTypedJson.mockResolvedValue({
      name: "root",
      version: "1.0.0",
      pnpm: {
        patchedDependencies: {
          "lodash@4.17.21": "some/nested/path/lodash.patch",
        },
      },
    } as PackageManifest);

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

    readTypedJson.mockResolvedValue({
      name: "root",
      version: "1.0.0",
      pnpm: {
        patchedDependencies: {
          "lodash@4.17.21": "patches/lodash.patch",
          "@firebase/app@1.2.3": "patches/firebase-app.patch",
        },
      },
    } as PackageManifest);

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
