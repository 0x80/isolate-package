import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { isolate } from "./isolate";

describe("isolate", () => {
  const temporaryDirectories: string[] = [];

  afterEach(async () => {
    await Promise.all(
      temporaryDirectories.splice(0).map((directory) => fs.remove(directory)),
    );
  });

  it("returns a non-Node target directory without isolating it", async () => {
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
  });

  it("rejects a target directory that does not exist", async () => {
    const workspaceRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "isolate-missing-target-test-"),
    );
    temporaryDirectories.push(workspaceRoot);
    const targetPackageDir = path.join(workspaceRoot, "missing-functions");

    await expect(
      isolate({ targetPackagePath: targetPackageDir }),
    ).rejects.toThrow();
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

  it("continues isolation for a Node package", async () => {
    const workspaceRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "isolate-node-functions-test-"),
    );
    temporaryDirectories.push(workspaceRoot);
    const targetPackageDir = path.join(workspaceRoot, "functions-node");
    await fs.ensureDir(targetPackageDir);
    await fs.writeJson(path.join(targetPackageDir, "package.json"), {
      name: "functions-node",
      version: "1.0.0",
    });

    await expect(
      isolate({ targetPackagePath: targetPackageDir, workspaceRoot: ".." }),
    ).rejects.toThrow(/Failed to infer the build output directory/);
  });
});
