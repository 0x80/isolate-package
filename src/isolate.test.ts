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
      workspaceRoot: "..",
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
      isolate({ targetPackagePath: targetPackageDir, workspaceRoot: ".." }),
    ).rejects.toThrow();
  });
});
