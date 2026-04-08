import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getInternalPackageNames } from "./get-internal-package-names";

const packageManagerResult = {
  name: "pnpm",
  version: "9.0.0",
  majorVersion: 9,
};

const mockDetectPackageManager = vi.fn(
  (_workspaceRootDir: string) => packageManagerResult,
);

vi.mock("~/lib/package-manager", () => ({
  usePackageManager: () => packageManagerResult,
  detectPackageManager: (workspaceRootDir: string) =>
    mockDetectPackageManager(workspaceRootDir),
}));

/**
 * Sets up a minimal workspace file structure with a target package and
 * workspace packages so that getInternalPackageNames can resolve them.
 */
async function createWorkspace(
  rootDir: string,
  {
    targetDeps = {} as Record<string, string>,
    targetDevDeps = {} as Record<string, string>,
    packages = [] as {
      name: string;
      dir: string;
      deps?: Record<string, string>;
    }[],
  },
) {
  const packagesDir = path.join(rootDir, "packages");
  const targetDir = path.join(packagesDir, "target");

  /** Write pnpm-workspace.yaml so the registry can find packages */
  await fs.writeFile(
    path.join(rootDir, "pnpm-workspace.yaml"),
    "packages:\n  - packages/*\n",
  );

  /** Write a pnpm lockfile so package manager detection works */
  await fs.writeFile(
    path.join(rootDir, "pnpm-lock.yaml"),
    "lockfileVersion: '9.0'\n",
  );

  /** Write target package manifest */
  await fs.ensureDir(targetDir);
  await fs.writeJson(path.join(targetDir, "package.json"), {
    name: "@test/target",
    version: "0.0.0",
    dependencies: targetDeps,
    devDependencies: targetDevDeps,
  });

  /** Write workspace package manifests */
  for (const pkg of packages) {
    const pkgDir = path.join(packagesDir, pkg.dir);
    await fs.ensureDir(pkgDir);
    await fs.writeJson(path.join(pkgDir, "package.json"), {
      name: pkg.name,
      version: "0.0.0",
      dependencies: pkg.deps ?? {},
    });
  }

  return targetDir;
}

describe("getInternalPackageNames", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    originalCwd = process.cwd();
    tempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "isolate-get-internal-test-"),
    );
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.remove(tempDir);
  });

  it("returns internal package names from the target manifest", async () => {
    const targetDir = await createWorkspace(tempDir, {
      targetDeps: { "@test/shared": "0.0.0", lodash: "^4.0.0" },
      packages: [{ name: "@test/shared", dir: "shared" }],
    });

    process.chdir(targetDir);

    const result = await getInternalPackageNames({ workspaceRoot: "../.." });
    expect(result).toEqual(["@test/shared"]);
    expect(mockDetectPackageManager).toHaveBeenCalled();
  });

  it("excludes devDependencies by default", async () => {
    const targetDir = await createWorkspace(tempDir, {
      targetDeps: { "@test/shared": "0.0.0" },
      targetDevDeps: { "@test/dev-tool": "0.0.0" },
      packages: [
        { name: "@test/shared", dir: "shared" },
        { name: "@test/dev-tool", dir: "dev-tool" },
      ],
    });

    process.chdir(targetDir);

    const result = await getInternalPackageNames({ workspaceRoot: "../.." });
    expect(result).toEqual(["@test/shared"]);
  });

  it("includes devDependencies when configured", async () => {
    const targetDir = await createWorkspace(tempDir, {
      targetDeps: { "@test/shared": "0.0.0" },
      targetDevDeps: { "@test/dev-tool": "0.0.0" },
      packages: [
        { name: "@test/shared", dir: "shared" },
        { name: "@test/dev-tool", dir: "dev-tool" },
      ],
    });

    process.chdir(targetDir);

    const result = await getInternalPackageNames({
      workspaceRoot: "../..",
      includeDevDependencies: true,
    });
    expect(result).toEqual(
      expect.arrayContaining(["@test/shared", "@test/dev-tool"]),
    );
    expect(result).toHaveLength(2);
  });

  it("resolves recursive internal dependencies", async () => {
    const targetDir = await createWorkspace(tempDir, {
      targetDeps: { "@test/app-utils": "0.0.0" },
      packages: [
        {
          name: "@test/app-utils",
          dir: "app-utils",
          deps: { "@test/core": "0.0.0" },
        },
        { name: "@test/core", dir: "core" },
      ],
    });

    process.chdir(targetDir);

    const result = await getInternalPackageNames({ workspaceRoot: "../.." });
    expect(result).toEqual(
      expect.arrayContaining(["@test/app-utils", "@test/core"]),
    );
    expect(result).toHaveLength(2);
  });

  it("returns an empty array when there are no internal dependencies", async () => {
    const targetDir = await createWorkspace(tempDir, {
      targetDeps: { lodash: "^4.0.0", express: "^4.0.0" },
      packages: [{ name: "@test/unrelated", dir: "unrelated" }],
    });

    process.chdir(targetDir);

    const result = await getInternalPackageNames({ workspaceRoot: "../.." });
    expect(result).toEqual([]);
  });

  it("loads config from isolate.config.json when no config is passed", async () => {
    const targetDir = await createWorkspace(tempDir, {
      targetDeps: { "@test/shared": "0.0.0" },
      targetDevDeps: { "@test/dev-tool": "0.0.0" },
      packages: [
        { name: "@test/shared", dir: "shared" },
        { name: "@test/dev-tool", dir: "dev-tool" },
      ],
    });

    /** Write config file with includeDevDependencies enabled */
    await fs.writeJson(path.join(targetDir, "isolate.config.json"), {
      workspaceRoot: "../..",
      includeDevDependencies: true,
    });

    process.chdir(targetDir);

    const result = await getInternalPackageNames();
    expect(result).toEqual(
      expect.arrayContaining(["@test/shared", "@test/dev-tool"]),
    );
    expect(result).toHaveLength(2);
  });
});
