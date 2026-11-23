import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { withReadablePnpmLockfileDir } from "./readable-pnpm-lockfile-dir";

const FIXTURES_DIR = path.join(import.meta.dirname, "__fixtures__");
const HELPER_FIXTURES_DIR = path.join(
  import.meta.dirname,
  "helpers/__fixtures__",
);

describe("withReadablePnpmLockfileDir", () => {
  let tmpBase: string | undefined;

  afterEach(async () => {
    if (tmpBase) await fs.remove(tmpBase);
  });

  async function copyWorkspace(fixtureWorkspaceDir: string) {
    tmpBase = await fs.mkdtemp(path.join(os.tmpdir(), "isolate-readable-"));
    const workspaceRoot = path.join(tmpBase, "workspace");
    await fs.copy(fixtureWorkspaceDir, workspaceRoot);
    return workspaceRoot;
  }

  it("hands over the workspace's own directory for a v9 lockfile", async () => {
    const workspaceRoot = await copyWorkspace(
      path.join(HELPER_FIXTURES_DIR, "pnpm-two-document/workspace"),
    );

    await expect(
      withReadablePnpmLockfileDir(
        { workspaceRootDir: workspaceRoot, isolateDir: workspaceRoot },
        async (lockfile) => lockfile,
      ),
    ).resolves.toEqual({ dir: workspaceRoot, isConverted: false });
  });

  it("hands over the workspace's own directory when there is no lockfile", async () => {
    tmpBase = await fs.mkdtemp(path.join(os.tmpdir(), "isolate-readable-"));

    await expect(
      withReadablePnpmLockfileDir(
        { workspaceRootDir: tmpBase, isolateDir: tmpBase },
        async (lockfile) => lockfile,
      ),
    ).resolves.toEqual({ dir: tmpBase, isConverted: false });
  });

  it("refuses a v13 lockfile in a Rush workspace", async () => {
    tmpBase = await fs.mkdtemp(path.join(os.tmpdir(), "isolate-readable-"));
    await fs.writeJson(path.join(tmpBase, "rush.json"), {});
    await fs.copy(
      path.join(FIXTURES_DIR, "pnpm-v13/workspace/pnpm-lock.yaml"),
      path.join(tmpBase, "common/config/rush/pnpm-lock.yaml"),
    );

    await expect(
      withReadablePnpmLockfileDir(
        { workspaceRootDir: tmpBase, isolateDir: tmpBase },
        async (lockfile) => lockfile,
      ),
    ).rejects.toThrow("lockfile format v13");
  });
});
