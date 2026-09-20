import fs from "fs-extra";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { parse } from "yaml";
import { afterEach, describe, expect, it } from "vitest";
import { isolate } from "./isolate";

describe("isolate integration", () => {
  const temporaryDirectories: string[] = [];
  const leftPadPatchContents = "diff --git a/index.js b/index.js\n";
  const leftPadPatchHash =
    "2692094a267de7e28825147fd6cb2ebde098a4e68c25dfa3976ac806f4a1a784";

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

  it("omits configured scripts from internal package manifests", async () => {
    const workspaceRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "isolate-omit-internal-scripts-test-"),
    );
    temporaryDirectories.push(workspaceRoot);
    const targetPackageDir = path.join(workspaceRoot, "packages", "functions");
    const sharedPackageDir = path.join(workspaceRoot, "packages", "shared");
    await fs.ensureDir(targetPackageDir);
    await fs.ensureDir(sharedPackageDir);
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
        "node_modules/shared": {
          resolved: "packages/shared",
          link: true,
        },
        "packages/functions": {
          name: "functions",
          version: "1.0.0",
          dependencies: { shared: "1.0.0" },
        },
        "packages/shared": {
          name: "shared",
          version: "1.0.0",
        },
      },
    });
    await fs.writeJson(path.join(targetPackageDir, "package.json"), {
      name: "functions",
      version: "1.0.0",
      main: "./index.js",
      files: ["index.js"],
      scripts: {
        preinstall: "echo target-preinstall",
        build: "echo target-build",
      },
      dependencies: { shared: "1.0.0" },
    });
    await fs.writeFile(path.join(targetPackageDir, "index.js"), "export {};\n");
    await fs.writeJson(path.join(sharedPackageDir, "package.json"), {
      name: "shared",
      version: "1.0.0",
      main: "./index.js",
      files: ["index.js"],
      scripts: {
        preinstall: "echo shared-preinstall",
        prepare: "echo shared-prepare",
        postinstall: "echo shared-postinstall",
        build: "echo shared-build",
      },
    });
    await fs.writeFile(path.join(sharedPackageDir, "index.js"), "export {};\n");

    const isolateDir = await isolate({
      targetPackagePath: targetPackageDir,
      buildDirName: ".",
      workspaceRoot: "../..",
      omitFromScripts: ["preinstall"],
    });

    const sharedManifest = await fs.readJson(
      path.join(isolateDir, "packages", "shared", "package.json"),
    );

    /**
     * The target keeps whatever `omitFromScripts` leaves, and the internal
     * package loses `preinstall` on top of the always-stripped `prepare`.
     */
    expect(sharedManifest.scripts).toEqual({
      postinstall: "echo shared-postinstall",
      build: "echo shared-build",
    });

    const targetManifest = await fs.readJson(
      path.join(isolateDir, "package.json"),
    );

    expect(targetManifest.scripts).toEqual({ build: "echo target-build" });
  });

  it.each([10, 11])(
    "writes pnpm %i patch settings to the lockfile and workspace configuration",
    async (majorVersion) => {
      const workspaceRoot = await fs.mkdtemp(
        path.join(os.tmpdir(), "isolate-pnpm-patches-test-"),
      );
      temporaryDirectories.push(workspaceRoot);
      const targetPackageDir = path.join(
        workspaceRoot,
        "packages",
        "functions",
      );
      await fs.ensureDir(targetPackageDir);
      await fs.ensureDir(path.join(workspaceRoot, "patches"));
      await fs.writeJson(path.join(workspaceRoot, "package.json"), {
        name: "workspace",
        version: "1.0.0",
        private: true,
        packageManager: `pnpm@${majorVersion}.0.0`,
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
          ...(majorVersion >= 11
            ? [`  left-pad@1.3.0: ${leftPadPatchHash}`]
            : [
                "  left-pad@1.3.0:",
                "    path: patches/left-pad@1.3.0.patch",
                `    hash: ${leftPadPatchHash}`,
              ]),
          "",
        ].join("\n"),
      );
      await fs.writeFile(
        path.join(workspaceRoot, "patches", "left-pad@1.3.0.patch"),
        leftPadPatchContents,
      );
      await fs.writeJson(path.join(targetPackageDir, "package.json"), {
        name: "functions",
        version: "1.0.0",
        main: "./index.js",
        files: ["index.js"],
        dependencies: { "left-pad": "1.3.0" },
        pnpm: {
          patchedDependencies: {
            "left-pad@1.3.0": "patches/stale-left-pad.patch",
          },
        },
      });
      await fs.writeFile(
        path.join(targetPackageDir, "index.js"),
        "export {};\n",
      );

      expect(
        createHash("sha256").update(leftPadPatchContents).digest("hex"),
      ).toBe(leftPadPatchHash);

      const isolateDir = await isolate({
        targetPackagePath: targetPackageDir,
        buildDirName: ".",
        workspaceRoot: "../..",
      });

      await expect(
        fs.readFile(
          path.join(isolateDir, "patches", "left-pad@1.3.0.patch"),
          "utf8",
        ),
      ).resolves.toBe(leftPadPatchContents);
      await expect(
        fs.pathExists(path.join(isolateDir, "patches", "stale-left-pad.patch")),
      ).resolves.toBe(false);

      const manifest = await fs.readJson(path.join(isolateDir, "package.json"));
      const workspaceSettings = parse(
        await fs.readFile(path.join(isolateDir, "pnpm-workspace.yaml"), "utf8"),
      );
      const lockfile = parse(
        await fs.readFile(path.join(isolateDir, "pnpm-lock.yaml"), "utf8"),
      );

      if (majorVersion >= 11) {
        expect(manifest.pnpm).toBeUndefined();
      } else {
        expect(manifest.pnpm?.patchedDependencies).toEqual({
          "left-pad@1.3.0": "patches/left-pad@1.3.0.patch",
        });
      }
      expect(workspaceSettings.patchedDependencies).toEqual({
        "left-pad@1.3.0": "patches/left-pad@1.3.0.patch",
      });
      expect(lockfile.patchedDependencies).toEqual(
        majorVersion >= 11
          ? { "left-pad@1.3.0": leftPadPatchHash }
          : {
              "left-pad@1.3.0": {
                path: "patches/left-pad@1.3.0.patch",
                hash: leftPadPatchHash,
              },
            },
      );
    },
  );
});
