import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getPnpmLockfileDir } from "./get-pnpm-lockfile-dir";

/**
 * Exercises the real helper against real directories, since what it decides is
 * whether `rush.json` is present. The consumer test suites mock it, so this is
 * the only place the actual path computation is covered.
 */
describe("getPnpmLockfileDir", () => {
  const cleanupPaths: string[] = [];

  afterEach(async () => {
    for (const p of cleanupPaths.splice(0)) {
      await fs.remove(p).catch(() => undefined);
    }
  });

  async function makeWorkspace({ isRush }: { isRush: boolean }) {
    const dir = await fs.mkdtemp(
      path.join(os.tmpdir(), "isolate-package-lockfile-dir-"),
    );
    cleanupPaths.push(dir);

    if (isRush) {
      await fs.writeJson(path.join(dir, "rush.json"), {});
    }

    return dir;
  }

  it("returns the workspace root for a regular workspace", async () => {
    const dir = await makeWorkspace({ isRush: false });

    expect(getPnpmLockfileDir(dir)).toBe(dir);
  });

  it("returns common/config/rush for a Rush workspace", async () => {
    const dir = await makeWorkspace({ isRush: true });

    expect(getPnpmLockfileDir(dir)).toBe(
      path.join(dir, "common", "config", "rush"),
    );
  });
});
