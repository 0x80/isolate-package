import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { generatePnpmLockfile } from "./generate-pnpm-lockfile";

/** Mock utils */
vi.mock("~/lib/utils", () => ({
  getErrorMessage: vi.fn((err: Error) => err.message),
  isRushWorkspace: vi.fn(() => false),
}));

/** Mock pnpm v8 lockfile functions */
vi.mock("pnpm_lockfile_file_v8", () => ({
  readWantedLockfile: vi.fn(),
  writeWantedLockfile: vi.fn(),
  getLockfileImporterId: vi.fn((_root: string, pkgDir: string) =>
    pkgDir.replace(/.*\//, "").replace(/\\/g, "/"),
  ),
}));

/** Mock pnpm v9 lockfile functions */
vi.mock("pnpm_lockfile_file_v9", () => ({
  readWantedLockfile: vi.fn(),
  writeWantedLockfile: vi.fn(),
  getLockfileImporterId: vi.fn((_root: string, pkgDir: string) =>
    pkgDir.replace(/.*\//, "").replace(/\\/g, "/"),
  ),
}));

/** Mock pnpm prune functions */
vi.mock("pnpm_prune_lockfile_v8", () => ({
  pruneLockfile: vi.fn((lockfile: Record<string, unknown>) => ({
    ...lockfile,
  })),
}));

vi.mock("pnpm_prune_lockfile_v9", () => ({
  pruneLockfile: vi.fn((lockfile: Record<string, unknown>) => ({
    ...lockfile,
  })),
}));

const {
  readWantedLockfile: readWantedLockfile_v8,
  writeWantedLockfile: writeWantedLockfile_v8,
  getLockfileImporterId: getLockfileImporterId_v8,
} = vi.mocked(await import("pnpm_lockfile_file_v8"));

const {
  readWantedLockfile: readWantedLockfile_v9,
  writeWantedLockfile: writeWantedLockfile_v9,
  getLockfileImporterId: getLockfileImporterId_v9,
} = vi.mocked(await import("pnpm_lockfile_file_v9"));

const { pruneLockfile: pruneLockfile_v8 } = vi.mocked(
  await import("pnpm_prune_lockfile_v8"),
);
const { pruneLockfile: pruneLockfile_v9 } = vi.mocked(
  await import("pnpm_prune_lockfile_v9"),
);

const { isRushWorkspace } = vi.mocked(await import("~/lib/utils"));

/** Reusable lockfile fixture */
function createMockLockfile() {
  return {
    lockfileVersion: "9.0",
    importers: {
      "apps/my-app": {
        specifiers: { shared: "workspace:*", lodash: "^4.17.21" },
        dependencies: {
          shared: "link:../../packages/shared",
          lodash: "4.17.21",
        },
      },
      "packages/shared": {
        specifiers: { lodash: "^4.17.21" },
        dependencies: {
          lodash: "4.17.21",
        },
      },
      "packages/other": {
        specifiers: {},
        dependencies: {},
      },
    },
    packages: {},
  };
}

describe("generatePnpmLockfile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should use v9 API when majorVersion >= 9", async () => {
    const lockfile = createMockLockfile();
    readWantedLockfile_v9.mockResolvedValue(lockfile as never);
    getLockfileImporterId_v9.mockReturnValue("apps/my-app");

    pruneLockfile_v9.mockReturnValue(lockfile as never);

    await generatePnpmLockfile({
      workspaceRootDir: "/workspace",
      targetPackageDir: "/workspace/apps/my-app",
      isolateDir: "/workspace/apps/my-app/isolate",
      internalDepPackageNames: ["shared"],
      packagesRegistry: {
        shared: {
          absoluteDir: "/workspace/packages/shared",
          rootRelativeDir: "packages/shared",
          manifest: { name: "shared", version: "1.0.0" },
        },
      },
      targetPackageManifest: { name: "my-app", version: "1.0.0" },
      majorVersion: 9,
      includeDevDependencies: false,
    });

    expect(readWantedLockfile_v9).toHaveBeenCalled();
    expect(writeWantedLockfile_v9).toHaveBeenCalled();
    expect(readWantedLockfile_v8).not.toHaveBeenCalled();
    expect(writeWantedLockfile_v8).not.toHaveBeenCalled();
  });

  it("should use v8 API when majorVersion < 9", async () => {
    const lockfile = createMockLockfile();
    readWantedLockfile_v8.mockResolvedValue(lockfile as never);
    getLockfileImporterId_v8.mockReturnValue("apps/my-app");

    pruneLockfile_v8.mockReturnValue(lockfile as never);

    await generatePnpmLockfile({
      workspaceRootDir: "/workspace",
      targetPackageDir: "/workspace/apps/my-app",
      isolateDir: "/workspace/apps/my-app/isolate",
      internalDepPackageNames: ["shared"],
      packagesRegistry: {
        shared: {
          absoluteDir: "/workspace/packages/shared",
          rootRelativeDir: "packages/shared",
          manifest: { name: "shared", version: "1.0.0" },
        },
      },
      targetPackageManifest: { name: "my-app", version: "1.0.0" },
      majorVersion: 8,
      includeDevDependencies: false,
    });

    expect(readWantedLockfile_v8).toHaveBeenCalled();
    expect(writeWantedLockfile_v8).toHaveBeenCalled();
    expect(readWantedLockfile_v9).not.toHaveBeenCalled();
    expect(writeWantedLockfile_v9).not.toHaveBeenCalled();
  });

  it("should remap target importer to root (.)", async () => {
    const lockfile = createMockLockfile();
    readWantedLockfile_v9.mockResolvedValue(lockfile as never);
    getLockfileImporterId_v9.mockReturnValue("apps/my-app");

    pruneLockfile_v9.mockImplementation((lf) => lf as never);

    await generatePnpmLockfile({
      workspaceRootDir: "/workspace",
      targetPackageDir: "/workspace/apps/my-app",
      isolateDir: "/workspace/apps/my-app/isolate",
      internalDepPackageNames: ["shared"],
      packagesRegistry: {
        shared: {
          absoluteDir: "/workspace/packages/shared",
          rootRelativeDir: "packages/shared",
          manifest: { name: "shared", version: "1.0.0" },
        },
      },
      targetPackageManifest: { name: "my-app", version: "1.0.0" },
      majorVersion: 9,
      includeDevDependencies: false,
    });

    /** The lockfile passed to prune should have importers with "." as the target */
    const pruneCall = pruneLockfile_v9.mock.calls[0]!;
    const prunedLockfile = pruneCall[0] as {
      importers: Record<string, unknown>;
    };
    expect(prunedLockfile.importers["."]).toBeDefined();
    expect(prunedLockfile.importers["apps/my-app"]).toBeUndefined();
  });

  it("should filter importers to only relevant packages", async () => {
    const lockfile = createMockLockfile();
    readWantedLockfile_v9.mockResolvedValue(lockfile as never);
    getLockfileImporterId_v9.mockReturnValue("apps/my-app");

    pruneLockfile_v9.mockImplementation((lf) => lf as never);

    await generatePnpmLockfile({
      workspaceRootDir: "/workspace",
      targetPackageDir: "/workspace/apps/my-app",
      isolateDir: "/workspace/apps/my-app/isolate",
      internalDepPackageNames: ["shared"],
      packagesRegistry: {
        shared: {
          absoluteDir: "/workspace/packages/shared",
          rootRelativeDir: "packages/shared",
          manifest: { name: "shared", version: "1.0.0" },
        },
      },
      targetPackageManifest: { name: "my-app", version: "1.0.0" },
      majorVersion: 9,
      includeDevDependencies: false,
    });

    const pruneCall = pruneLockfile_v9.mock.calls[0]!;
    const prunedLockfile = pruneCall[0] as {
      importers: Record<string, unknown>;
    };

    /** Only the target (remapped to ".") and internal dep "packages/shared" should be present */
    expect(Object.keys(prunedLockfile.importers)).toEqual(
      expect.arrayContaining([".", "packages/shared"]),
    );
    /** "packages/other" should be excluded */
    expect(prunedLockfile.importers["packages/other"]).toBeUndefined();
  });

  it("should preserve overrides after pruning", async () => {
    const lockfile = {
      ...createMockLockfile(),
      overrides: { lodash: "4.17.21" },
    };
    readWantedLockfile_v9.mockResolvedValue(lockfile as never);
    getLockfileImporterId_v9.mockReturnValue("apps/my-app");

    /** Simulate prune removing overrides */
    pruneLockfile_v9.mockImplementation((lf) => {
      const result = { ...(lf as unknown as Record<string, unknown>) };
      delete result.overrides;
      return result as never;
    });

    await generatePnpmLockfile({
      workspaceRootDir: "/workspace",
      targetPackageDir: "/workspace/apps/my-app",
      isolateDir: "/workspace/apps/my-app/isolate",
      internalDepPackageNames: ["shared"],
      packagesRegistry: {
        shared: {
          absoluteDir: "/workspace/packages/shared",
          rootRelativeDir: "packages/shared",
          manifest: { name: "shared", version: "1.0.0" },
        },
      },
      targetPackageManifest: { name: "my-app", version: "1.0.0" },
      majorVersion: 9,
      includeDevDependencies: false,
    });

    const writeCall = writeWantedLockfile_v9.mock.calls[0]!;
    const writtenLockfile = writeCall[1] as {
      overrides?: Record<string, string>;
    };
    expect(writtenLockfile.overrides).toEqual({ lodash: "4.17.21" });
  });

  it("should preserve packageExtensionsChecksum after pruning", async () => {
    const lockfile = {
      ...createMockLockfile(),
      packageExtensionsChecksum: "abc123",
    };
    readWantedLockfile_v9.mockResolvedValue(lockfile as never);
    getLockfileImporterId_v9.mockReturnValue("apps/my-app");

    /** Simulate prune removing packageExtensionsChecksum */
    pruneLockfile_v9.mockImplementation((lf) => {
      const result = { ...(lf as unknown as Record<string, unknown>) };
      delete result.packageExtensionsChecksum;
      return result as never;
    });

    await generatePnpmLockfile({
      workspaceRootDir: "/workspace",
      targetPackageDir: "/workspace/apps/my-app",
      isolateDir: "/workspace/apps/my-app/isolate",
      internalDepPackageNames: ["shared"],
      packagesRegistry: {
        shared: {
          absoluteDir: "/workspace/packages/shared",
          rootRelativeDir: "packages/shared",
          manifest: { name: "shared", version: "1.0.0" },
        },
      },
      targetPackageManifest: { name: "my-app", version: "1.0.0" },
      majorVersion: 9,
      includeDevDependencies: false,
    });

    const writeCall = writeWantedLockfile_v9.mock.calls[0]!;
    const writtenLockfile = writeCall[1] as {
      packageExtensionsChecksum?: string;
    };
    expect(writtenLockfile.packageExtensionsChecksum).toBe("abc123");
  });

  it("should include patchedDependencies in written lockfile", async () => {
    const lockfile = createMockLockfile();
    readWantedLockfile_v9.mockResolvedValue(lockfile as never);
    getLockfileImporterId_v9.mockReturnValue("apps/my-app");
    pruneLockfile_v9.mockImplementation((lf) => lf as never);

    const patchedDependencies = {
      "lodash@4.17.21": { path: "patches/lodash.patch", hash: "abc123" },
    };

    await generatePnpmLockfile({
      workspaceRootDir: "/workspace",
      targetPackageDir: "/workspace/apps/my-app",
      isolateDir: "/workspace/apps/my-app/isolate",
      internalDepPackageNames: ["shared"],
      packagesRegistry: {
        shared: {
          absoluteDir: "/workspace/packages/shared",
          rootRelativeDir: "packages/shared",
          manifest: { name: "shared", version: "1.0.0" },
        },
      },
      targetPackageManifest: { name: "my-app", version: "1.0.0" },
      majorVersion: 9,
      includeDevDependencies: false,
      patchedDependencies,
    });

    const writeCall = writeWantedLockfile_v9.mock.calls[0]!;
    const writtenLockfile = writeCall[1] as {
      patchedDependencies?: Record<string, unknown>;
    };
    expect(writtenLockfile.patchedDependencies).toEqual(patchedDependencies);
  });

  it("should throw when lockfile is not found", async () => {
    readWantedLockfile_v9.mockResolvedValue(null as never);

    await expect(
      generatePnpmLockfile({
        workspaceRootDir: "/workspace",
        targetPackageDir: "/workspace/apps/my-app",
        isolateDir: "/workspace/apps/my-app/isolate",
        internalDepPackageNames: [],
        packagesRegistry: {},
        targetPackageManifest: { name: "my-app", version: "1.0.0" },
        majorVersion: 9,
        includeDevDependencies: false,
      }),
    ).rejects.toThrow();
  });

  it("should use Rush lockfile path when in a Rush workspace", async () => {
    isRushWorkspace.mockReturnValue(true);
    const lockfile = createMockLockfile();
    readWantedLockfile_v9.mockResolvedValue(lockfile as never);
    getLockfileImporterId_v9.mockReturnValue("apps/my-app");
    pruneLockfile_v9.mockImplementation((lf) => lf as never);

    await generatePnpmLockfile({
      workspaceRootDir: "/workspace",
      targetPackageDir: "/workspace/apps/my-app",
      isolateDir: "/workspace/apps/my-app/isolate",
      internalDepPackageNames: ["shared"],
      packagesRegistry: {
        shared: {
          absoluteDir: "/workspace/packages/shared",
          rootRelativeDir: "packages/shared",
          manifest: { name: "shared", version: "1.0.0" },
        },
      },
      targetPackageManifest: { name: "my-app", version: "1.0.0" },
      majorVersion: 9,
      includeDevDependencies: false,
    });

    expect(readWantedLockfile_v9).toHaveBeenCalledWith(
      "/workspace/common/config/rush",
      expect.any(Object),
    );
  });
});
