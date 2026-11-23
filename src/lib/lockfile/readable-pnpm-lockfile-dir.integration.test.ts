import fs from "fs-extra";
import { exec } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { parseAllDocuments } from "yaml";
import { afterEach, describe, expect, it, vi } from "vitest";
import { isolate } from "#/isolate";

const execAsync = promisify(exec);

const FIXTURE_DIR = path.join(
  import.meta.dirname,
  "__fixtures__/pnpm-v13/workspace",
);

/** The hash pnpm 12.23.0 locked for the fixture's scheduler patch */
const SCHEDULER_PATCH_HASH =
  "348b23379a778b5fa321145dd3bd5659dee6a173269c98c098148e966c5349b7";

/**
 * Probe pnpm from the fixture directory, so a launcher that honors
 * `packageManager` can select the fixture's pinned pnpm 12.23.0.
 */
async function readPnpmVersion() {
  try {
    const { stdout } = await execAsync("pnpm --version", {
      cwd: FIXTURE_DIR,
      timeout: 60_000,
      env: { ...process.env, COREPACK_ENABLE_DOWNLOAD_PROMPT: "0" },
    });
    return stdout.trim();
  } catch {
    return undefined;
  }
}

const pnpmVersion = await readPnpmVersion();
const [major = 0, minor = 0] = (pnpmVersion ?? "").split(".").map(Number);
const supportsV13 = major > 12 || (major === 12 && minor >= 19);

if (process.env.REQUIRE_PNPM_V13 && !supportsV13) {
  throw new Error(
    `REQUIRE_PNPM_V13 is set but pnpm on PATH is ${pnpmVersion ?? "unavailable"}`,
  );
}

/**
 * Reproduction of https://github.com/0x80/isolate-package/issues/219. The
 * fixture lockfile was written by pnpm 12.23.0 with `lockfile.format: v13`.
 * Nothing is mocked: the conversion runs the real pnpm binary. The fixture's
 * recursive `apps/**` glob would also match isolate output inside a package
 * unless staging leaves it out.
 */
describe.skipIf(!supportsV13)(
  "isolate with a pnpm v13 lockfile",
  { timeout: 120_000 },
  () => {
    let tmpBase: string | undefined;

    afterEach(async () => {
      vi.restoreAllMocks();
      if (tmpBase) await fs.remove(tmpBase);
    });

    /**
     * Copy the fixture, and point `os.tmpdir()` at a directory of this test's
     * own, so the staging directory is checked without other runs' staging
     * directories in the way.
     */
    async function setupWorkspace() {
      tmpBase = await fs.mkdtemp(path.join(os.tmpdir(), "isolate-pnpm-v13-"));
      const workspaceRoot = path.join(tmpBase, "workspace");
      const stagingParentDir = path.join(tmpBase, "tmp");
      await fs.copy(FIXTURE_DIR, workspaceRoot);
      await fs.ensureDir(stagingParentDir);
      vi.spyOn(os, "tmpdir").mockReturnValue(stagingParentDir);

      return {
        workspaceRoot,
        stagingParentDir,
        appDir: path.join(workspaceRoot, "apps/app"),
        lockfilePath: path.join(workspaceRoot, "pnpm-lock.yaml"),
        workspaceConfigPath: path.join(workspaceRoot, "pnpm-workspace.yaml"),
      };
    }

    function isolateApp(appDir: string) {
      return isolate({
        targetPackagePath: appDir,
        workspaceRoot: "../..",
        buildDirName: ".",
        logLevel: "error",
      });
    }

    it("writes a pruned v9 lockfile that pnpm accepts, leaving the workspace untouched", async () => {
      const { appDir, lockfilePath, workspaceConfigPath, stagingParentDir } =
        await setupWorkspace();
      const sourceLockfile = await fs.readFile(lockfilePath, "utf8");
      const sourceConfig = await fs.readFile(workspaceConfigPath, "utf8");

      const isolateDir = await isolateApp(appDir);

      expect(os.tmpdir).toHaveBeenCalled();
      await expect(fs.readdir(stagingParentDir)).resolves.toEqual([]);

      const documents = parseAllDocuments(
        await fs.readFile(path.join(isolateDir, "pnpm-lock.yaml"), "utf8"),
      ).map((document) => document.toJS() as Record<string, any>);
      const projectDocument = documents.at(-1);

      expect(projectDocument?.lockfileVersion).toBe("9.0");
      expect(projectDocument?.importers["."].dependencies).toEqual({
        react: { specifier: "18.3.1", version: "18.3.1" },
        "react-dom": { specifier: "18.3.1", version: "18.3.1(react@18.3.1)" },
      });
      expect(Object.keys(projectDocument?.snapshots ?? {})).not.toContain(
        "react-dom@19.2.0(react@19.2.0)",
      );

      /** The app reaches the patched scheduler only through react-dom */
      await expect(
        fs.readFile(
          path.join(isolateDir, "patches/scheduler@0.23.2.patch"),
          "utf8",
        ),
      ).resolves.toBe(
        await fs.readFile(
          path.join(FIXTURE_DIR, "patches/scheduler@0.23.2.patch"),
          "utf8",
        ),
      );
      expect(JSON.stringify(projectDocument?.patchedDependencies)).toContain(
        SCHEDULER_PATCH_HASH,
      );

      await expect(
        execAsync(
          "pnpm install --frozen-lockfile --lockfile-only --ignore-scripts",
          { cwd: isolateDir },
        ),
      ).resolves.toBeDefined();

      await expect(fs.readFile(lockfilePath, "utf8")).resolves.toBe(
        sourceLockfile,
      );
      await expect(fs.readFile(workspaceConfigPath, "utf8")).resolves.toBe(
        sourceConfig,
      );
    });

    it("converts while another package holds isolate output", async () => {
      const { workspaceRoot, appDir } = await setupWorkspace();
      await fs.outputJson(
        path.join(workspaceRoot, "apps/other/isolate/package.json"),
        { name: "other", dependencies: { react: "19.2.0" } },
      );

      const isolateDir = await isolateApp(appDir);

      await expect(
        fs.pathExists(path.join(isolateDir, "pnpm-lock.yaml")),
      ).resolves.toBe(true);
    });

    it("fails clearly when the lockfile is out of date with the manifests", async () => {
      const { appDir, lockfilePath, stagingParentDir } = await setupWorkspace();
      const sourceLockfile = await fs.readFile(lockfilePath, "utf8");

      const manifestPath = path.join(appDir, "package.json");
      const manifest = await fs.readJson(manifestPath);
      manifest.dependencies.react = "19.2.0";
      await fs.writeJson(manifestPath, manifest);

      await expect(isolateApp(appDir)).rejects.toThrow(
        "Failed to convert the pnpm lockfile",
      );
      await expect(fs.readdir(stagingParentDir)).resolves.toEqual([]);
      await expect(fs.readFile(lockfilePath, "utf8")).resolves.toBe(
        sourceLockfile,
      );
    });
  },
);
