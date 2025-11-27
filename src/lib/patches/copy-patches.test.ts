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
  readTypedJson: vi.fn(),
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
const { filterPatchedDependencies, readTypedJson } = vi.mocked(
  await import("~/lib/utils")
);

describe("copyPatches", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should return empty object when includePatchedDependencies is false", async () => {
    const result = await copyPatches({
      workspaceRootDir: "/workspace",
      targetPackageManifest: { name: "test", version: "1.0.0" },
      isolateDir: "/workspace/isolate",
      includePatchedDependencies: false,
      includeDevDependencies: false,
    });

    expect(result).toEqual({});
    expect(readTypedJson).not.toHaveBeenCalled();
  });

  it("should return empty object when workspace root package.json cannot be read", async () => {
    readTypedJson.mockRejectedValue(new Error("File not found"));

    const result = await copyPatches({
      workspaceRootDir: "/workspace",
      targetPackageManifest: { name: "test", version: "1.0.0" },
      isolateDir: "/workspace/isolate",
      includePatchedDependencies: true,
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
      includePatchedDependencies: true,
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
      includePatchedDependencies: true,
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
      includePatchedDependencies: true,
      includeDevDependencies: false,
    });

    expect(result).toEqual({
      "lodash@4.17.21": "patches/lodash.patch",
    });
    expect(fs.ensureDir).toHaveBeenCalledWith("/workspace/isolate/patches");
    expect(fs.copy).toHaveBeenCalledWith(
      "/workspace/patches/lodash.patch",
      "/workspace/isolate/patches/lodash.patch"
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
      includePatchedDependencies: true,
      includeDevDependencies: true,
    });

    expect(result).toEqual({
      "vitest@1.0.0": "patches/vitest.patch",
    });
    expect(filterPatchedDependencies).toHaveBeenCalledWith(
      { "vitest@1.0.0": "patches/vitest.patch" },
      targetManifest,
      true,
      expect.any(Object)
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
      includePatchedDependencies: true,
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
      includePatchedDependencies: true,
      includeDevDependencies: false,
    });

    expect(result).toEqual({
      "@firebase/app@1.2.3": "patches/firebase-app.patch",
    });
  });

  it("should handle filename collisions by renaming", async () => {
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
      includePatchedDependencies: true,
      includeDevDependencies: false,
    });

    expect(result).toEqual({
      "pkg-a@1.0.0": "patches/fix.patch",
      "pkg-b@1.0.0": "patches/fix-1.patch",
    });
    expect(fs.copy).toHaveBeenCalledTimes(2);
  });

  it("should transform patch paths correctly for isolated directory", async () => {
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
      includePatchedDependencies: true,
      includeDevDependencies: false,
    });

    /** The path should be flattened to patches/ directory */
    expect(result).toEqual({
      "lodash@4.17.21": "patches/lodash.patch",
    });
    expect(fs.copy).toHaveBeenCalledWith(
      "/workspace/some/nested/path/lodash.patch",
      "/workspace/isolate/patches/lodash.patch"
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
      includePatchedDependencies: true,
      includeDevDependencies: false,
    });

    expect(result).toEqual({
      "lodash@4.17.21": "patches/lodash.patch",
      "@firebase/app@1.2.3": "patches/firebase-app.patch",
    });
    expect(fs.copy).toHaveBeenCalledTimes(2);
  });
});
