import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { EnvLockfile } from "pnpm_lockfile_file_v9";
import type { PackageManifest } from "#/lib/types";
import { generatePnpmLockfile } from "./generate-pnpm-lockfile";

/** Mock utils */
/**
 * Hoisted so the `#/lib/utils` factory below can use it for both
 * `isRushWorkspace` and the `getPnpmLockfileDir` that is derived from it.
 */
const isRushWorkspaceMock = vi.hoisted(() =>
  vi.fn((_workspaceRootDir: string) => false),
);

vi.mock("#/lib/utils", () => ({
  getErrorMessage: vi.fn((err: Error) => err.message),
  isRushWorkspace: isRushWorkspaceMock,
  /**
   * Mirrors the real helper, which is a pure path computation on top of the
   * mocked `isRushWorkspace` above — so the Rush cases still exercise the
   * branch rather than a hard-coded answer.
   */
  getPnpmLockfileDir: vi.fn((workspaceRootDir: string) =>
    isRushWorkspaceMock(workspaceRootDir)
      ? `${workspaceRootDir}/common/config/rush`
      : workspaceRootDir,
  ),
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
  readEnvLockfile: vi.fn(),
  writeEnvLockfile: vi.fn(),
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
  readEnvLockfile: readEnvLockfile_v9,
  writeEnvLockfile: writeEnvLockfile_v9,
  getLockfileImporterId: getLockfileImporterId_v9,
} = vi.mocked(await import("pnpm_lockfile_file_v9"));

const { pruneLockfile: pruneLockfile_v8 } = vi.mocked(
  await import("pnpm_prune_lockfile_v8"),
);
const { pruneLockfile: pruneLockfile_v9 } = vi.mocked(
  await import("pnpm_prune_lockfile_v9"),
);

const { isRushWorkspace } = vi.mocked(await import("#/lib/utils"));

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
    /**
     * `clearAllMocks` resets calls but not implementations, so the defaults
     * have to be reapplied here — otherwise the one test that turns Rush on
     * leaks into whatever runs next, and the env reader resolves to undefined
     * rather than to the "no env document" answer its contract allows.
     */
    isRushWorkspace.mockReturnValue(false);
    readEnvLockfile_v9.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should use v9 API when majorVersion >= 9", async () => {
    const lockfile = createMockLockfile();
    readWantedLockfile_v9.mockResolvedValue(lockfile as never);
    getLockfileImporterId_v9.mockReturnValue("apps/my-app" as never);

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
    getLockfileImporterId_v9.mockReturnValue("apps/my-app" as never);

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
    getLockfileImporterId_v9.mockReturnValue("apps/my-app" as never);

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
    getLockfileImporterId_v9.mockReturnValue("apps/my-app" as never);

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
    getLockfileImporterId_v9.mockReturnValue("apps/my-app" as never);

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

  it("should restore the catalogs snapshot after pruning (#198)", async () => {
    const catalogs = {
      default: {
        lodash: { specifier: "^4.17.21", version: "4.17.21" },
      },
      utils: {
        ramda: { specifier: "^0.30.0", version: "0.30.0" },
      },
    };
    const lockfile = {
      ...createMockLockfile(),
      catalogs,
    };
    readWantedLockfile_v9.mockResolvedValue(lockfile as never);
    getLockfileImporterId_v9.mockReturnValue("apps/my-app" as never);

    /** Simulate prune dropping the catalogs snapshot */
    pruneLockfile_v9.mockImplementation((lf) => {
      const result = { ...(lf as unknown as Record<string, unknown>) };
      delete result.catalogs;
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
      catalogs?: Record<string, Record<string, unknown>>;
    };

    /**
     * The catalogs snapshot is restored verbatim (like overrides), so it stays
     * in sync with the importer specifiers and the verbatim pnpm-workspace.yaml
     * copy.
     */
    expect(writtenLockfile.catalogs).toEqual(catalogs);
  });

  it("should not set catalogs when the source lockfile has none", async () => {
    const lockfile = createMockLockfile();
    readWantedLockfile_v9.mockResolvedValue(lockfile as never);
    getLockfileImporterId_v9.mockReturnValue("apps/my-app" as never);
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

    const writeCall = writeWantedLockfile_v9.mock.calls[0]!;
    const writtenLockfile = writeCall[1] as { catalogs?: unknown };
    expect(writtenLockfile.catalogs).toBeUndefined();
  });

  it("should include patchedDependencies in written lockfile", async () => {
    const lockfile = createMockLockfile();
    readWantedLockfile_v9.mockResolvedValue(lockfile as never);
    getLockfileImporterId_v9.mockReturnValue("apps/my-app" as never);
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

  it("writes patched dependency hashes for pnpm 11 and later", async () => {
    const lockfile = createMockLockfile();
    readWantedLockfile_v9.mockResolvedValue(lockfile as never);
    getLockfileImporterId_v9.mockReturnValue("apps/my-app" as never);
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
      majorVersion: 11,
      includeDevDependencies: false,
      patchedDependencies: {
        "lodash@4.17.21": {
          path: "patches/lodash.patch",
          hash: "sha256-abc123",
        },
      },
    });

    const writeCall = writeWantedLockfile_v9.mock.calls[0]!;
    const writtenLockfile = writeCall[1] as {
      patchedDependencies?: Record<string, unknown>;
    };
    expect(writtenLockfile.patchedDependencies).toEqual({
      "lodash@4.17.21": "sha256-abc123",
    });
  });

  it("rejects a pnpm 11 patch without a lockfile hash", async () => {
    const lockfile = createMockLockfile();
    readWantedLockfile_v9.mockResolvedValue(lockfile as never);
    getLockfileImporterId_v9.mockReturnValue("apps/my-app" as never);
    pruneLockfile_v9.mockImplementation((lf) => lf as never);

    await expect(
      generatePnpmLockfile({
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
        majorVersion: 11,
        includeDevDependencies: false,
        patchedDependencies: {
          "lodash@4.17.21": {
            path: "patches/lodash.patch",
            hash: "",
          },
        },
      }),
    ).rejects.toThrow("Patch lodash@4.17.21 has no lockfile hash");
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

  it("propagates lockfile read failures", async () => {
    const readError = new Error("invalid lockfile");
    readWantedLockfile_v9.mockRejectedValue(readError);

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
    ).rejects.toBe(readError);
  });

  it("should use Rush lockfile path when in a Rush workspace", async () => {
    isRushWorkspace.mockReturnValue(true);
    const lockfile = createMockLockfile();
    readWantedLockfile_v9.mockResolvedValue(lockfile as never);
    getLockfileImporterId_v9.mockReturnValue("apps/my-app" as never);
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

  describe("lockfile env document", () => {
    /**
     * The env document pnpm 12 writes ahead of the project document, holding
     * `configDependencies` and `packageManagerDependencies`.
     */
    const envLockfile = {
      lockfileVersion: "9.0",
      importers: {
        ".": {
          configDependencies: {},
          packageManagerDependencies: {
            pnpm: { specifier: "12.0.0", version: "12.0.0" },
          },
        },
      },
      packages: {},
      snapshots: {},
    } satisfies EnvLockfile;

    beforeEach(() => {
      const lockfile = createMockLockfile();
      readWantedLockfile_v9.mockResolvedValue(lockfile as never);
      getLockfileImporterId_v9.mockReturnValue("apps/my-app" as never);
      pruneLockfile_v9.mockImplementation((lf) => lf as never);
    });

    async function generate(targetPackageManifest: PackageManifest) {
      await generatePnpmLockfile({
        workspaceRootDir: "/workspace",
        targetPackageDir: "/workspace/apps/my-app",
        isolateDir: "/workspace/apps/my-app/isolate",
        internalDepPackageNames: [],
        packagesRegistry: {},
        targetPackageManifest,
        majorVersion: 12,
        includeDevDependencies: false,
      });
    }

    it("should copy the env document when the output keeps a packageManager", async () => {
      readEnvLockfile_v9.mockResolvedValue(envLockfile);

      await generate({
        name: "my-app",
        version: "1.0.0",
        packageManager: "pnpm@12.0.0",
      });

      expect(readEnvLockfile_v9).toHaveBeenCalledWith("/workspace");
      expect(writeEnvLockfile_v9).toHaveBeenCalledWith(
        "/workspace/apps/my-app/isolate",
        envLockfile,
      );
    });

    /**
     * Only the call order is checked here, since these are mocks: that the real
     * writer preserves the project document is a property of the library, and
     * the integration test is what actually asserts it.
     */
    it("should write the env document after the project document", async () => {
      readEnvLockfile_v9.mockResolvedValue(envLockfile);

      await generate({
        name: "my-app",
        version: "1.0.0",
        packageManager: "pnpm@12.0.0",
      });

      expect(writeWantedLockfile_v9.mock.invocationCallOrder[0]!).toBeLessThan(
        writeEnvLockfile_v9.mock.invocationCallOrder[0]!,
      );
    });

    it("should skip the env document when the output omits the packageManager", async () => {
      readEnvLockfile_v9.mockResolvedValue(envLockfile);

      await generate({ name: "my-app", version: "1.0.0" });

      expect(writeEnvLockfile_v9).not.toHaveBeenCalled();
    });

    it("should skip the env document when the workspace lockfile has none", async () => {
      readEnvLockfile_v9.mockResolvedValue(null);

      await generate({
        name: "my-app",
        version: "1.0.0",
        packageManager: "pnpm@12.0.0",
      });

      expect(writeEnvLockfile_v9).not.toHaveBeenCalled();
    });

    it("should read the env document from the Rush lockfile directory", async () => {
      isRushWorkspace.mockReturnValue(true);
      readEnvLockfile_v9.mockResolvedValue(null);

      await generate({
        name: "my-app",
        version: "1.0.0",
        packageManager: "pnpm@12.0.0",
      });

      expect(readEnvLockfile_v9).toHaveBeenCalledWith(
        "/workspace/common/config/rush",
      );
    });
  });

  it("should not touch the env document on the v8 path", async () => {
    const lockfile = createMockLockfile();
    readWantedLockfile_v8.mockResolvedValue(lockfile as never);
    getLockfileImporterId_v8.mockReturnValue("apps/my-app");
    pruneLockfile_v8.mockImplementation((lf) => lf as never);

    await generatePnpmLockfile({
      workspaceRootDir: "/workspace",
      targetPackageDir: "/workspace/apps/my-app",
      isolateDir: "/workspace/apps/my-app/isolate",
      internalDepPackageNames: [],
      packagesRegistry: {},
      targetPackageManifest: {
        name: "my-app",
        version: "1.0.0",
        packageManager: "pnpm@8.15.0",
      },
      majorVersion: 8,
      includeDevDependencies: false,
    });

    expect(readEnvLockfile_v9).not.toHaveBeenCalled();
    expect(writeEnvLockfile_v9).not.toHaveBeenCalled();
  });
});
