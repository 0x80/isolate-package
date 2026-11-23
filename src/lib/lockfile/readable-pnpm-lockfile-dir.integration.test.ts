import fs from "fs-extra";
import { exec } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { parseAllDocuments } from "yaml";
import { afterEach, describe, expect, it } from "vitest";
import { isolate } from "#/isolate";

const execAsync = promisify(exec);

const FIXTURE_DIR = path.join(
  import.meta.dirname,
  "__fixtures__/pnpm-v13/workspace",
);

/**
 * Probe pnpm from the fixture directory, so a pnpm 10 or 11 launcher sees the
 * fixture's `packageManager` pin and switches to pnpm 12.23.0. Where no pnpm 12
 * is reachable the suite skips, unless `REQUIRE_PNPM_V13` makes that a failure.
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
 * recursive `apps/**` glob also reaches the isolate output inside `apps/app`.
 */

const STAGING_DIR_PREFIX = "isolate-pnpm-lockfile-";

async function listStagingDirs() {
  const names = await fs.readdir(os.tmpdir());
  return names.filter((name) => name.startsWith(STAGING_DIR_PREFIX));
}
describe.skipIf(!supportsV13)("isolate with a pnpm v13 lockfile", () => {
  let tmpBase: string | undefined;

  afterEach(async () => {
    if (tmpBase) await fs.remove(tmpBase);
  });

  async function setupWorkspace() {
    tmpBase = await fs.mkdtemp(path.join(os.tmpdir(), "isolate-pnpm-v13-"));
    const workspaceRoot = path.join(tmpBase, "workspace");
    await fs.copy(FIXTURE_DIR, workspaceRoot);

    return {
      workspaceRoot,
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
    const { appDir, lockfilePath, workspaceConfigPath } =
      await setupWorkspace();
    const sourceLockfile = await fs.readFile(lockfilePath, "utf8");
    const sourceConfig = await fs.readFile(workspaceConfigPath, "utf8");
    const stagingDirsBefore = await listStagingDirs();

    const isolateDir = await isolateApp(appDir);

    await expect(listStagingDirs()).resolves.toEqual(stagingDirsBefore);

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

  it("fails clearly when the lockfile is out of date with the manifests", async () => {
    const { appDir, lockfilePath } = await setupWorkspace();
    const sourceLockfile = await fs.readFile(lockfilePath, "utf8");

    const manifestPath = path.join(appDir, "package.json");
    const manifest = await fs.readJson(manifestPath);
    manifest.dependencies.react = "19.2.0";
    await fs.writeJson(manifestPath, manifest);
    const stagingDirsBefore = await listStagingDirs();

    await expect(isolateApp(appDir)).rejects.toThrow(
      "Failed to convert the pnpm lockfile",
    );
    await expect(listStagingDirs()).resolves.toEqual(stagingDirsBefore);
    await expect(fs.readFile(lockfilePath, "utf8")).resolves.toBe(
      sourceLockfile,
    );
  });
});
