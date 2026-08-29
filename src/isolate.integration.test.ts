import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { isolate } from "./isolate";

describe("isolate integration", () => {
  const temporaryDirectories: string[] = [];

  afterEach(async () => {
    await Promise.all(
      temporaryDirectories.splice(0).map((directory) => fs.remove(directory)),
    );
  });

  it("continues isolation for a Node package", async () => {
    const workspaceRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "isolate-node-functions-test-"),
    );
    temporaryDirectories.push(workspaceRoot);
    const targetPackageDir = path.join(
      workspaceRoot,
      "packages",
      "functions-node",
    );
    await fs.ensureDir(targetPackageDir);
    await fs.writeJson(path.join(workspaceRoot, "package.json"), {
      name: "workspace",
      version: "1.0.0",
      private: true,
      workspaces: ["packages/*"],
    });
    await fs.writeJson(path.join(workspaceRoot, "package-lock.json"), {
      name: "workspace",
      version: "1.0.0",
      lockfileVersion: 3,
      requires: true,
      packages: {
        "": {
          name: "workspace",
          version: "1.0.0",
          workspaces: ["packages/*"],
        },
        "packages/functions-node": {
          name: "functions-node",
          version: "1.0.0",
        },
      },
    });
    await fs.writeJson(path.join(targetPackageDir, "package.json"), {
      name: "functions-node",
      version: "1.0.0",
      files: ["index.js"],
    });
    await fs.writeFile(path.join(targetPackageDir, "index.js"), "export {};\n");

    const result = await isolate({
      targetPackagePath: targetPackageDir,
      buildDirName: ".",
      workspaceRoot: "../..",
    });

    expect(result).toBe(path.join(targetPackageDir, "isolate"));
    await expect(
      fs.readJson(path.join(result, "package.json")),
    ).resolves.toMatchObject({ name: "functions-node", version: "1.0.0" });
  });
});
