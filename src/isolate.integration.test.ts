import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import { parse } from "yaml";
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

  it("writes pnpm 11 patch settings to the lockfile and workspace configuration", async () => {
    const workspaceRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "isolate-pnpm-patches-test-"),
    );
    temporaryDirectories.push(workspaceRoot);
    const targetPackageDir = path.join(workspaceRoot, "packages", "functions");
    await fs.ensureDir(targetPackageDir);
    await fs.ensureDir(path.join(workspaceRoot, "patches"));
    await fs.writeJson(path.join(workspaceRoot, "package.json"), {
      name: "workspace",
      version: "1.0.0",
      private: true,
    });
    await fs.writeFile(
      path.join(workspaceRoot, "pnpm-workspace.yaml"),
      [
        "packages:",
        "  - packages/*",
        "patchedDependencies:",
        "  left-pad@1.3.0: patches/left-pad@1.3.0.patch",
        "",
      ].join("\n"),
    );
    await fs.writeFile(
      path.join(workspaceRoot, "pnpm-lock.yaml"),
      [
        "lockfileVersion: '9.0'",
        "",
        "settings:",
        "  autoInstallPeers: false",
        "",
        "importers:",
        "",
        "  packages/functions:",
        "    dependencies:",
        "      left-pad:",
        "        specifier: 1.3.0",
        "        version: 1.3.0",
        "",
        "packages:",
        "",
        "  left-pad@1.3.0:",
        "    resolution: {integrity: sha512-1}",
        "",
        "snapshots:",
        "",
        "  left-pad@1.3.0: {}",
        "",
        "patchedDependencies:",
        "  left-pad@1.3.0: sha256-patched",
        "",
      ].join("\n"),
    );
    await fs.writeFile(
      path.join(workspaceRoot, "patches", "left-pad@1.3.0.patch"),
      "diff --git a/index.js b/index.js\n",
    );
    await fs.writeJson(path.join(targetPackageDir, "package.json"), {
      name: "functions",
      version: "1.0.0",
      main: "./index.js",
      files: ["index.js"],
      dependencies: { "left-pad": "1.3.0" },
    });
    await fs.writeFile(path.join(targetPackageDir, "index.js"), "export {};\n");

    const isolateDir = await isolate({
      targetPackagePath: targetPackageDir,
      buildDirName: ".",
      workspaceRoot: "../..",
    });

    const manifest = await fs.readJson(path.join(isolateDir, "package.json"));
    const workspaceSettings = parse(
      await fs.readFile(path.join(isolateDir, "pnpm-workspace.yaml"), "utf8"),
    );
    const lockfile = parse(
      await fs.readFile(path.join(isolateDir, "pnpm-lock.yaml"), "utf8"),
    );

    expect(manifest.pnpm?.patchedDependencies).toBeUndefined();
    expect(workspaceSettings.patchedDependencies).toEqual({
      "left-pad@1.3.0": "patches/left-pad@1.3.0.patch",
    });
    expect(lockfile.patchedDependencies).toEqual({
      "left-pad@1.3.0": "sha256-patched",
    });
  });
});
