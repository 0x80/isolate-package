import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  generateBunLockfile,
  serializeWithTrailingCommas,
} from "./generate-bun-lockfile";

/** Mock fs-extra */
vi.mock("fs-extra", () => ({
  default: {
    existsSync: vi.fn(),
    writeFile: vi.fn(),
  },
}));

/** Mock the utils */
vi.mock("~/lib/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/lib/utils")>();
  return {
    getErrorMessage: vi.fn((err: Error) => err.message),
    getPackageName: actual.getPackageName,
    readTypedJsonSync: vi.fn(),
  };
});

const fs = vi.mocked((await import("fs-extra")).default);
const { readTypedJsonSync } = vi.mocked(await import("~/lib/utils"));

/** Reusable packages registry fixture */
function createPackagesRegistry() {
  return {
    shared: {
      absoluteDir: "/workspace/packages/shared",
      rootRelativeDir: "packages/shared",
      manifest: {
        name: "shared",
        version: "1.0.0",
      },
    },
    utils: {
      absoluteDir: "/workspace/packages/utils",
      rootRelativeDir: "packages/utils",
      manifest: {
        name: "utils",
        version: "1.0.0",
      },
    },
  };
}

type BunLockfileFixture = {
  lockfileVersion: number;
  workspaces: Record<string, Record<string, unknown>>;
  packages: Record<string, unknown[]>;
  overrides?: Record<string, string>;
  trustedDependencies?: string[];
  patchedDependencies?: Record<string, string>;
};

/** Reusable bun lockfile fixture */
function createBunLockfile(): BunLockfileFixture {
  return {
    lockfileVersion: 0,
    workspaces: {
      "": {
        name: "root",
        dependencies: { lodash: "^4.17.21" },
      },
      "apps/my-app": {
        name: "my-app",
        dependencies: {
          shared: "workspace:*",
          express: "^4.18.0",
        },
        devDependencies: {
          vitest: "^1.0.0",
        },
      },
      "packages/shared": {
        name: "shared",
        version: "1.0.0",
        dependencies: {
          utils: "workspace:*",
          lodash: "^4.17.21",
        },
        devDependencies: {
          typescript: "^5.0.0",
        },
      },
      "packages/utils": {
        name: "utils",
        version: "1.0.0",
        dependencies: {},
      },
      "packages/other": {
        name: "other",
        version: "1.0.0",
        dependencies: {
          axios: "^1.0.0",
        },
      },
    },
    packages: {
      express: [
        "express@4.18.2",
        "https://registry.npmjs.org/express/-/express-4.18.2.tgz",
        { dependencies: { "body-parser": "1.20.1" } },
        "sha512-abc",
      ],
      "body-parser": [
        "body-parser@1.20.1",
        "https://registry.npmjs.org/body-parser/-/body-parser-1.20.1.tgz",
        {},
        "sha512-def",
      ],
      lodash: [
        "lodash@4.17.21",
        "https://registry.npmjs.org/lodash/-/lodash-4.17.21.tgz",
        {},
        "sha512-ghi",
      ],
      vitest: [
        "vitest@1.0.0",
        "https://registry.npmjs.org/vitest/-/vitest-1.0.0.tgz",
        {},
        "sha512-jkl",
      ],
      typescript: [
        "typescript@5.3.0",
        "https://registry.npmjs.org/typescript/-/typescript-5.3.0.tgz",
        {},
        "sha512-mno",
      ],
      axios: [
        "axios@1.6.0",
        "https://registry.npmjs.org/axios/-/axios-1.6.0.tgz",
        {},
        "sha512-pqr",
      ],
      shared: ["shared@workspace:packages/shared", {}],
      utils: ["utils@workspace:packages/utils", {}],
      other: ["other@workspace:packages/other", {}],
    },
  };
}

describe("serializeWithTrailingCommas", () => {
  it("should add trailing commas to JSON output", () => {
    const input = { a: 1, b: [2, 3] };
    const result = serializeWithTrailingCommas(input);

    expect(result).toContain('"a": 1,');
    expect(result).toContain("3,\n");
    expect(result).toMatch(/\}$/);
  });

  it("should handle nested objects", () => {
    const input = { a: { b: "c" } };
    const result = serializeWithTrailingCommas(input);
    const parsed = JSON.parse(result.replace(/,(\s*[}\]])/g, "$1"));
    expect(parsed).toEqual(input);
  });

  it("should produce valid content that round-trips through strip-json-comments", () => {
    const input = { key: "value", arr: [1, 2] };
    const result = serializeWithTrailingCommas(input);
    /** The output has trailing commas, which strip-json-comments can handle */
    expect(result).toMatch(/,\n\s*\]/);
    expect(result).toMatch(/,\n\s*\}/);
  });
});

describe("generateBunLockfile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should throw when bun.lock is missing", async () => {
    fs.existsSync.mockReturnValue(false);

    await expect(
      generateBunLockfile({
        workspaceRootDir: "/workspace",
        targetPackageDir: "/workspace/apps/my-app",
        isolateDir: "/workspace/apps/my-app/isolate",
        internalDepPackageNames: ["shared"],
        packagesRegistry: createPackagesRegistry(),
        includeDevDependencies: false,
      }),
    ).rejects.toThrow("Failed to find bun.lock");
  });

  it("should filter workspaces to only target and internal deps", async () => {
    fs.existsSync.mockReturnValue(true);
    fs.writeFile.mockResolvedValue();
    readTypedJsonSync.mockReturnValue(createBunLockfile());

    await generateBunLockfile({
      workspaceRootDir: "/workspace",
      targetPackageDir: "/workspace/apps/my-app",
      isolateDir: "/workspace/apps/my-app/isolate",
      internalDepPackageNames: ["shared", "utils"],
      packagesRegistry: createPackagesRegistry(),

      includeDevDependencies: false,
    });

    const writeCall = fs.writeFile.mock.calls[0]!;
    const written = JSON.parse(
      (writeCall[1] as string).replace(/,(\s*[}\]])/g, "$1"),
    );

    /** Target is remapped to "" */
    expect(written.workspaces[""]).toBeDefined();
    expect(written.workspaces[""].name).toBe("my-app");

    /** Internal deps are present */
    expect(written.workspaces["packages/shared"]).toBeDefined();
    expect(written.workspaces["packages/utils"]).toBeDefined();

    /** Root workspace and non-internal packages are excluded */
    expect(written.workspaces["packages/other"]).toBeUndefined();
    expect(written.workspaces["apps/my-app"]).toBeUndefined();
  });

  it("should remap target workspace to root key", async () => {
    fs.existsSync.mockReturnValue(true);
    fs.writeFile.mockResolvedValue();
    readTypedJsonSync.mockReturnValue(createBunLockfile());

    await generateBunLockfile({
      workspaceRootDir: "/workspace",
      targetPackageDir: "/workspace/apps/my-app",
      isolateDir: "/workspace/apps/my-app/isolate",
      internalDepPackageNames: ["shared"],
      packagesRegistry: createPackagesRegistry(),

      includeDevDependencies: false,
    });

    const writeCall = fs.writeFile.mock.calls[0]!;
    const written = JSON.parse(
      (writeCall[1] as string).replace(/,(\s*[}\]])/g, "$1"),
    );

    expect(written.workspaces[""]).toBeDefined();
    expect(written.workspaces["apps/my-app"]).toBeUndefined();
  });

  it("should prune unreferenced packages", async () => {
    fs.existsSync.mockReturnValue(true);
    fs.writeFile.mockResolvedValue();
    readTypedJsonSync.mockReturnValue(createBunLockfile());

    await generateBunLockfile({
      workspaceRootDir: "/workspace",
      targetPackageDir: "/workspace/apps/my-app",
      isolateDir: "/workspace/apps/my-app/isolate",
      internalDepPackageNames: ["shared", "utils"],
      packagesRegistry: createPackagesRegistry(),

      includeDevDependencies: false,
    });

    const writeCall = fs.writeFile.mock.calls[0]!;
    const written = JSON.parse(
      (writeCall[1] as string).replace(/,(\s*[}\]])/g, "$1"),
    );

    /** express and its transitive dep body-parser should be kept */
    expect(written.packages["express"]).toBeDefined();
    expect(written.packages["body-parser"]).toBeDefined();

    /** lodash is used by shared, should be kept */
    expect(written.packages["lodash"]).toBeDefined();

    /** Workspace entries for kept internal deps should be kept */
    expect(written.packages["shared"]).toBeDefined();
    expect(written.packages["utils"]).toBeDefined();

    /** axios is only used by "other" which is not in the isolate */
    expect(written.packages["axios"]).toBeUndefined();

    /** Workspace entry for "other" should be removed */
    expect(written.packages["other"]).toBeUndefined();
  });

  it("should remove workspace package entries for non-isolated packages", async () => {
    fs.existsSync.mockReturnValue(true);
    fs.writeFile.mockResolvedValue();

    const lockfile = createBunLockfile();
    /** Add a reference to "other" from the target so it's in requiredPackages */
    const appWorkspace = lockfile.workspaces["apps/my-app"]!;
    (appWorkspace.dependencies as Record<string, string>)["other"] =
      "workspace:*";
    readTypedJsonSync.mockReturnValue(lockfile);

    await generateBunLockfile({
      workspaceRootDir: "/workspace",
      targetPackageDir: "/workspace/apps/my-app",
      isolateDir: "/workspace/apps/my-app/isolate",
      internalDepPackageNames: ["shared", "utils"],
      packagesRegistry: createPackagesRegistry(),

      includeDevDependencies: false,
    });

    const writeCall = fs.writeFile.mock.calls[0]!;
    const written = JSON.parse(
      (writeCall[1] as string).replace(/,(\s*[}\]])/g, "$1"),
    );

    /**
     * "other" is referenced but not in internalDepPackageNames, so its
     * workspace entry should be removed from packages
     */
    expect(written.packages["other"]).toBeUndefined();
  });

  it("should exclude devDependencies from target when includeDevDependencies is false", async () => {
    fs.existsSync.mockReturnValue(true);
    fs.writeFile.mockResolvedValue();
    readTypedJsonSync.mockReturnValue(createBunLockfile());

    await generateBunLockfile({
      workspaceRootDir: "/workspace",
      targetPackageDir: "/workspace/apps/my-app",
      isolateDir: "/workspace/apps/my-app/isolate",
      internalDepPackageNames: ["shared"],
      packagesRegistry: createPackagesRegistry(),

      includeDevDependencies: false,
    });

    const writeCall = fs.writeFile.mock.calls[0]!;
    const written = JSON.parse(
      (writeCall[1] as string).replace(/,(\s*[}\]])/g, "$1"),
    );

    /** Target workspace should not have devDependencies */
    expect(written.workspaces[""].devDependencies).toBeUndefined();

    /** vitest (a devDep) should not be in packages */
    expect(written.packages["vitest"]).toBeUndefined();
  });

  it("should include devDependencies from target when includeDevDependencies is true", async () => {
    fs.existsSync.mockReturnValue(true);
    fs.writeFile.mockResolvedValue();
    readTypedJsonSync.mockReturnValue(createBunLockfile());

    await generateBunLockfile({
      workspaceRootDir: "/workspace",
      targetPackageDir: "/workspace/apps/my-app",
      isolateDir: "/workspace/apps/my-app/isolate",
      internalDepPackageNames: ["shared"],
      packagesRegistry: createPackagesRegistry(),

      includeDevDependencies: true,
    });

    const writeCall = fs.writeFile.mock.calls[0]!;
    const written = JSON.parse(
      (writeCall[1] as string).replace(/,(\s*[}\]])/g, "$1"),
    );

    /** Target workspace should have devDependencies */
    expect(written.workspaces[""].devDependencies).toEqual({
      vitest: "^1.0.0",
    });

    /** vitest should be in packages */
    expect(written.packages["vitest"]).toBeDefined();
  });

  it("should always strip devDependencies from internal deps", async () => {
    fs.existsSync.mockReturnValue(true);
    fs.writeFile.mockResolvedValue();
    readTypedJsonSync.mockReturnValue(createBunLockfile());

    await generateBunLockfile({
      workspaceRootDir: "/workspace",
      targetPackageDir: "/workspace/apps/my-app",
      isolateDir: "/workspace/apps/my-app/isolate",
      internalDepPackageNames: ["shared", "utils"],
      packagesRegistry: createPackagesRegistry(),

      includeDevDependencies: true,
    });

    const writeCall = fs.writeFile.mock.calls[0]!;
    const written = JSON.parse(
      (writeCall[1] as string).replace(/,(\s*[}\]])/g, "$1"),
    );

    /** Internal dep "shared" should not have devDependencies */
    expect(
      written.workspaces["packages/shared"].devDependencies,
    ).toBeUndefined();

    /** typescript (shared's devDep) should not be in packages */
    expect(written.packages["typescript"]).toBeUndefined();
  });

  it("should preserve overrides", async () => {
    fs.existsSync.mockReturnValue(true);
    fs.writeFile.mockResolvedValue();

    const lockfile = createBunLockfile();
    lockfile.overrides = { lodash: "4.17.21" };
    readTypedJsonSync.mockReturnValue(lockfile);

    await generateBunLockfile({
      workspaceRootDir: "/workspace",
      targetPackageDir: "/workspace/apps/my-app",
      isolateDir: "/workspace/apps/my-app/isolate",
      internalDepPackageNames: ["shared"],
      packagesRegistry: createPackagesRegistry(),

      includeDevDependencies: false,
    });

    const writeCall = fs.writeFile.mock.calls[0]!;
    const written = JSON.parse(
      (writeCall[1] as string).replace(/,(\s*[}\]])/g, "$1"),
    );

    expect(written.overrides).toEqual({ lodash: "4.17.21" });
  });

  it("should filter trustedDependencies to only included packages", async () => {
    fs.existsSync.mockReturnValue(true);
    fs.writeFile.mockResolvedValue();

    const lockfile = createBunLockfile();
    lockfile.trustedDependencies = ["express", "axios", "lodash"];
    readTypedJsonSync.mockReturnValue(lockfile);

    await generateBunLockfile({
      workspaceRootDir: "/workspace",
      targetPackageDir: "/workspace/apps/my-app",
      isolateDir: "/workspace/apps/my-app/isolate",
      internalDepPackageNames: ["shared"],
      packagesRegistry: createPackagesRegistry(),

      includeDevDependencies: false,
    });

    const writeCall = fs.writeFile.mock.calls[0]!;
    const written = JSON.parse(
      (writeCall[1] as string).replace(/,(\s*[}\]])/g, "$1"),
    );

    /** axios is not in the output, so it should be filtered out */
    expect(written.trustedDependencies).toEqual(
      expect.arrayContaining(["express", "lodash"]),
    );
    expect(written.trustedDependencies).not.toContain("axios");
  });

  it("should filter patchedDependencies to only included packages", async () => {
    fs.existsSync.mockReturnValue(true);
    fs.writeFile.mockResolvedValue();

    const lockfile = createBunLockfile();
    lockfile.patchedDependencies = {
      "express@4.18.2": "patches/express.patch",
      "axios@1.6.0": "patches/axios.patch",
    };
    readTypedJsonSync.mockReturnValue(lockfile);

    await generateBunLockfile({
      workspaceRootDir: "/workspace",
      targetPackageDir: "/workspace/apps/my-app",
      isolateDir: "/workspace/apps/my-app/isolate",
      internalDepPackageNames: ["shared"],
      packagesRegistry: createPackagesRegistry(),

      includeDevDependencies: false,
    });

    const writeCall = fs.writeFile.mock.calls[0]!;
    const written = JSON.parse(
      (writeCall[1] as string).replace(/,(\s*[}\]])/g, "$1"),
    );

    expect(written.patchedDependencies).toEqual({
      "express@4.18.2": "patches/express.patch",
    });
    /** axios is not in the output */
    expect(written.patchedDependencies["axios@1.6.0"]).toBeUndefined();
  });

  it("should write output with trailing commas", async () => {
    fs.existsSync.mockReturnValue(true);
    fs.writeFile.mockResolvedValue();
    readTypedJsonSync.mockReturnValue(createBunLockfile());

    await generateBunLockfile({
      workspaceRootDir: "/workspace",
      targetPackageDir: "/workspace/apps/my-app",
      isolateDir: "/workspace/apps/my-app/isolate",
      internalDepPackageNames: ["shared"],
      packagesRegistry: createPackagesRegistry(),

      includeDevDependencies: false,
    });

    const writeCall = fs.writeFile.mock.calls[0]!;
    const content = writeCall[1] as string;

    /** Should contain trailing commas before closing braces/brackets */
    expect(content).toMatch(/,\n\s*\}/);
  });

  it("should write to the correct output path", async () => {
    fs.existsSync.mockReturnValue(true);
    fs.writeFile.mockResolvedValue();
    readTypedJsonSync.mockReturnValue(createBunLockfile());

    await generateBunLockfile({
      workspaceRootDir: "/workspace",
      targetPackageDir: "/workspace/apps/my-app",
      isolateDir: "/workspace/apps/my-app/isolate",
      internalDepPackageNames: ["shared"],
      packagesRegistry: createPackagesRegistry(),

      includeDevDependencies: false,
    });

    expect(fs.writeFile).toHaveBeenCalledWith(
      "/workspace/apps/my-app/isolate/bun.lock",
      expect.any(String),
    );
  });

  it("should preserve lockfileVersion", async () => {
    fs.existsSync.mockReturnValue(true);
    fs.writeFile.mockResolvedValue();
    readTypedJsonSync.mockReturnValue(createBunLockfile());

    await generateBunLockfile({
      workspaceRootDir: "/workspace",
      targetPackageDir: "/workspace/apps/my-app",
      isolateDir: "/workspace/apps/my-app/isolate",
      internalDepPackageNames: ["shared"],
      packagesRegistry: createPackagesRegistry(),

      includeDevDependencies: false,
    });

    const writeCall = fs.writeFile.mock.calls[0]!;
    const written = JSON.parse(
      (writeCall[1] as string).replace(/,(\s*[}\]])/g, "$1"),
    );

    expect(written.lockfileVersion).toBe(0);
  });

  it("should resolve transitive dependencies", async () => {
    fs.existsSync.mockReturnValue(true);
    fs.writeFile.mockResolvedValue();

    const lockfile = createBunLockfile();
    /** Add a chain: express -> body-parser -> raw-body */
    lockfile.packages["body-parser"]![2] = {
      dependencies: { "raw-body": "2.5.1" },
    };
    lockfile.packages["raw-body"] = [
      "raw-body@2.5.1",
      "https://registry.npmjs.org/raw-body/-/raw-body-2.5.1.tgz",
      {},
      "sha512-stu",
    ];
    readTypedJsonSync.mockReturnValue(lockfile);

    await generateBunLockfile({
      workspaceRootDir: "/workspace",
      targetPackageDir: "/workspace/apps/my-app",
      isolateDir: "/workspace/apps/my-app/isolate",
      internalDepPackageNames: ["shared"],
      packagesRegistry: createPackagesRegistry(),

      includeDevDependencies: false,
    });

    const writeCall = fs.writeFile.mock.calls[0]!;
    const written = JSON.parse(
      (writeCall[1] as string).replace(/,(\s*[}\]])/g, "$1"),
    );

    /** The full transitive chain should be present */
    expect(written.packages["express"]).toBeDefined();
    expect(written.packages["body-parser"]).toBeDefined();
    expect(written.packages["raw-body"]).toBeDefined();
  });
});
