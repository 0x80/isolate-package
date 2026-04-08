import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { processLockfile } from "./process-lockfile";
import type { IsolateConfigResolved } from "../config";

/** Mock the package manager detection */
vi.mock("~/lib/package-manager", () => ({
  usePackageManager: vi.fn(),
}));

/** Mock all lockfile generators */
vi.mock("./helpers", () => ({
  generateBunLockfile: vi.fn(),
  generateNpmLockfile: vi.fn(),
  generatePnpmLockfile: vi.fn(),
  generateYarnLockfile: vi.fn(),
}));

const { usePackageManager } = vi.mocked(await import("~/lib/package-manager"));
const {
  generateBunLockfile,
  generateNpmLockfile,
  generatePnpmLockfile,
  generateYarnLockfile,
} = vi.mocked(await import("./helpers"));

/** Minimal config for testing */
function createConfig(
  overrides?: Partial<IsolateConfigResolved>,
): IsolateConfigResolved {
  return {
    buildDirName: "dist",
    forceNpm: false,
    includeDevDependencies: false,
    isolateDirName: "isolate",
    logLevel: "info",
    omitPackageManager: false,
    tsconfigPath: undefined,
    workspacePackages: undefined,
    workspaceRoot: undefined,
    ...overrides,
  } as IsolateConfigResolved;
}

describe("processLockfile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should route to npm generator for npm package manager", async () => {
    usePackageManager.mockReturnValue({
      name: "npm",
      majorVersion: 10,
      version: "10.0.0",
      packageManagerString: "npm@10.0.0",
    });

    const result = await processLockfile({
      workspaceRootDir: "/workspace",
      isolateDir: "/workspace/apps/my-app/isolate",
      packagesRegistry: {},
      internalDepPackageNames: [],
      targetPackageDir: "/workspace/apps/my-app",
      targetPackageName: "my-app",
      targetPackageManifest: { name: "my-app", version: "1.0.0" },
      config: createConfig(),
    });

    expect(generateNpmLockfile).toHaveBeenCalledWith({
      workspaceRootDir: "/workspace",
      isolateDir: "/workspace/apps/my-app/isolate",
    });
    expect(result).toBe(false);
  });

  it("should route to pnpm generator for pnpm package manager", async () => {
    usePackageManager.mockReturnValue({
      name: "pnpm",
      majorVersion: 9,
      version: "9.0.0",
      packageManagerString: "pnpm@9.0.0",
    });

    const config = createConfig({ includeDevDependencies: true });

    await processLockfile({
      workspaceRootDir: "/workspace",
      isolateDir: "/workspace/apps/my-app/isolate",
      packagesRegistry: { shared: {} as never },
      internalDepPackageNames: ["shared"],
      targetPackageDir: "/workspace/apps/my-app",
      targetPackageName: "my-app",
      targetPackageManifest: { name: "my-app", version: "1.0.0" },
      config,
    });

    expect(generatePnpmLockfile).toHaveBeenCalledWith({
      workspaceRootDir: "/workspace",
      targetPackageDir: "/workspace/apps/my-app",
      isolateDir: "/workspace/apps/my-app/isolate",
      internalDepPackageNames: ["shared"],
      packagesRegistry: { shared: {} as never },
      targetPackageManifest: { name: "my-app", version: "1.0.0" },
      majorVersion: 9,
      includeDevDependencies: true,
      patchedDependencies: undefined,
    });
  });

  it("should route to yarn generator for yarn v1", async () => {
    usePackageManager.mockReturnValue({
      name: "yarn",
      majorVersion: 1,
      version: "1.22.0",
      packageManagerString: "yarn@1.22.0",
    });

    const result = await processLockfile({
      workspaceRootDir: "/workspace",
      isolateDir: "/workspace/apps/my-app/isolate",
      packagesRegistry: {},
      internalDepPackageNames: [],
      targetPackageDir: "/workspace/apps/my-app",
      targetPackageName: "my-app",
      targetPackageManifest: { name: "my-app", version: "1.0.0" },
      config: createConfig(),
    });

    expect(generateYarnLockfile).toHaveBeenCalledWith({
      workspaceRootDir: "/workspace",
      isolateDir: "/workspace/apps/my-app/isolate",
    });
    expect(result).toBe(false);
  });

  it("should fall back to npm for modern yarn (v2+)", async () => {
    usePackageManager.mockReturnValue({
      name: "yarn",
      majorVersion: 4,
      version: "4.0.0",
      packageManagerString: "yarn@4.0.0",
    });

    const result = await processLockfile({
      workspaceRootDir: "/workspace",
      isolateDir: "/workspace/apps/my-app/isolate",
      packagesRegistry: {},
      internalDepPackageNames: [],
      targetPackageDir: "/workspace/apps/my-app",
      targetPackageName: "my-app",
      targetPackageManifest: { name: "my-app", version: "1.0.0" },
      config: createConfig(),
    });

    expect(generateNpmLockfile).toHaveBeenCalled();
    expect(result).toBe(true);
  });

  it("should route to bun generator for bun package manager", async () => {
    usePackageManager.mockReturnValue({
      name: "bun",
      majorVersion: 1,
      version: "1.2.0",
      packageManagerString: "bun@1.2.0",
    });

    const result = await processLockfile({
      workspaceRootDir: "/workspace",
      isolateDir: "/workspace/apps/my-app/isolate",
      packagesRegistry: {},
      internalDepPackageNames: ["shared"],
      targetPackageDir: "/workspace/apps/my-app",
      targetPackageName: "my-app",
      targetPackageManifest: { name: "my-app", version: "1.0.0" },
      config: createConfig(),
    });

    expect(generateBunLockfile).toHaveBeenCalledWith({
      workspaceRootDir: "/workspace",
      targetPackageDir: "/workspace/apps/my-app",
      isolateDir: "/workspace/apps/my-app/isolate",
      internalDepPackageNames: ["shared"],
      packagesRegistry: {},
      includeDevDependencies: false,
    });
    expect(result).toBe(false);
  });

  it("should use npm when forceNpm is true regardless of package manager", async () => {
    usePackageManager.mockReturnValue({
      name: "pnpm",
      majorVersion: 9,
      version: "9.0.0",
      packageManagerString: "pnpm@9.0.0",
    });

    const result = await processLockfile({
      workspaceRootDir: "/workspace",
      isolateDir: "/workspace/apps/my-app/isolate",
      packagesRegistry: {},
      internalDepPackageNames: [],
      targetPackageDir: "/workspace/apps/my-app",
      targetPackageName: "my-app",
      targetPackageManifest: { name: "my-app", version: "1.0.0" },
      config: createConfig({ forceNpm: true }),
    });

    expect(generateNpmLockfile).toHaveBeenCalled();
    expect(generatePnpmLockfile).not.toHaveBeenCalled();
    expect(result).toBe(true);
  });

  it("should fall back to npm for unknown package manager", async () => {
    usePackageManager.mockReturnValue({
      name: "unknown" as never,
      majorVersion: 1,
      version: "1.0.0",
      packageManagerString: "unknown@1.0.0",
    });

    const result = await processLockfile({
      workspaceRootDir: "/workspace",
      isolateDir: "/workspace/apps/my-app/isolate",
      packagesRegistry: {},
      internalDepPackageNames: [],
      targetPackageDir: "/workspace/apps/my-app",
      targetPackageName: "my-app",
      targetPackageManifest: { name: "my-app", version: "1.0.0" },
      config: createConfig(),
    });

    expect(generateNpmLockfile).toHaveBeenCalled();
    expect(result).toBe(true);
  });
});
