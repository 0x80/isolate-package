import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { isolate } from "./isolate";

const mockLogger = vi.hoisted(() => ({
  debug: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
}));

vi.mock("./lib/logger", () => ({
  setLogLevel: vi.fn(),
  useLogger: () => mockLogger,
}));

describe("isolate", () => {
  const temporaryDirectories: string[] = [];

  afterEach(async () => {
    vi.clearAllMocks();
    await Promise.all(
      temporaryDirectories.splice(0).map((directory) => fs.remove(directory)),
    );
  });

  it("returns a target without a package manifest without isolating it", async () => {
    const workspaceRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "isolate-python-functions-test-"),
    );
    temporaryDirectories.push(workspaceRoot);
    const targetPackageDir = path.join(workspaceRoot, "functions-python");
    await fs.ensureDir(targetPackageDir);
    await fs.writeFile(
      path.join(targetPackageDir, "main.py"),
      "def hello(): pass\n",
    );

    const result = await isolate({
      targetPackagePath: targetPackageDir,
    });

    expect(result).toBe(targetPackageDir);
    await expect(
      fs.pathExists(path.join(targetPackageDir, "isolate")),
    ).resolves.toBe(false);
    expect(mockLogger.info).toHaveBeenCalledWith(
      "Skipping isolation because the target directory has no package.json",
      targetPackageDir,
    );
  });

  it("warns when a skipped target contains stale isolate output", async () => {
    const targetPackageDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "isolate-stale-output-test-"),
    );
    temporaryDirectories.push(targetPackageDir);
    const existingIsolateDir = path.join(targetPackageDir, "previous-output");
    await fs.ensureDir(existingIsolateDir);

    await isolate({
      targetPackagePath: targetPackageDir,
      isolateDirName: "previous-output",
    });

    expect(mockLogger.warn).toHaveBeenCalledWith(
      "The skipped target contains an existing isolate path that may be stale",
      existingIsolateDir,
    );
  });

  it("rejects a target directory that does not exist", async () => {
    const workspaceRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "isolate-missing-target-test-"),
    );
    temporaryDirectories.push(workspaceRoot);
    const targetPackageDir = path.join(workspaceRoot, "missing-functions");

    await expect(
      isolate({ targetPackagePath: targetPackageDir }),
    ).rejects.toThrow(
      `Target package path does not exist: ${targetPackageDir}`,
    );
  });

  it("rejects a target path that is not a directory", async () => {
    const workspaceRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "isolate-file-target-test-"),
    );
    temporaryDirectories.push(workspaceRoot);
    const targetPackagePath = path.join(workspaceRoot, "functions-python");
    await fs.writeFile(targetPackagePath, "not a directory\n");

    await expect(isolate({ targetPackagePath })).rejects.toThrow(
      /Target package path is not a directory/,
    );
  });

  it("rejects an invalid package.json path", async () => {
    const targetPackageDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "isolate-invalid-manifest-test-"),
    );
    temporaryDirectories.push(targetPackageDir);
    await fs.ensureDir(path.join(targetPackageDir, "package.json"));

    await expect(
      isolate({ targetPackagePath: targetPackageDir }),
    ).rejects.toThrow(
      `Package manifest is not a file: ${path.join(targetPackageDir, "package.json")}`,
    );
  });

  it("rejects a dangling package.json symlink", async () => {
    const targetPackageDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "isolate-dangling-manifest-test-"),
    );
    temporaryDirectories.push(targetPackageDir);
    const targetManifestPath = path.join(targetPackageDir, "package.json");
    await fs.symlink("missing-package.json", targetManifestPath);

    await expect(
      isolate({ targetPackagePath: targetPackageDir }),
    ).rejects.toThrow(
      `Package manifest cannot be resolved: ${targetManifestPath}`,
    );
  });
});
