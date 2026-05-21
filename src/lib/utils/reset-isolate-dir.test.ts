import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetIsolateDir } from "./reset-isolate-dir";

/**
 * Wait until `predicate` returns true or the timeout elapses. Used for the
 * fire-and-forget background delete, which we can't await directly.
 */
async function waitFor(
  predicate: () => boolean | Promise<boolean>,
  {
    timeoutMs = 2000,
    intervalMs = 20,
  }: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Timed out after ${timeoutMs}ms waiting for predicate`);
}

describe("resetIsolateDir", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "reset-isolate-dir-"));
  });

  afterEach(async () => {
    await fs.remove(tempDir).catch(() => {
      /** Best-effort. */
    });
  });

  it("creates an empty isolate dir when none exists", async () => {
    const isolateDir = path.join(tempDir, "package", "isolate");

    await resetIsolateDir(isolateDir);

    expect(fs.existsSync(isolateDir)).toBe(true);
    expect(await fs.readdir(isolateDir)).toEqual([]);
  });

  it("empties an existing isolate dir and creates the trash sibling next to it by default", async () => {
    const isolateDir = path.join(tempDir, "package", "isolate");
    await fs.ensureDir(isolateDir);
    await fs.writeFile(path.join(isolateDir, "stale.txt"), "stale");

    await resetIsolateDir(isolateDir);

    expect(fs.existsSync(isolateDir)).toBe(true);
    expect(await fs.readdir(isolateDir)).toEqual([]);

    /** Background delete eventually removes the trash sibling. */
    await waitFor(async () => {
      const entries = await fs.readdir(path.dirname(isolateDir));
      return entries.every((entry) => !entry.includes(".trash-"));
    });
  });

  it("places trash in the provided trashParentDir instead of next to isolateDir", async () => {
    const packageParent = path.join(tempDir, "packages");
    const isolateDir = path.join(packageParent, "api", "isolate");
    await fs.ensureDir(isolateDir);
    await fs.writeFile(path.join(isolateDir, "stale.txt"), "stale");

    /**
     * Block the background delete by holding the trash dir open. We grab the
     * snapshot immediately after the call so we can assert where the trash
     * landed before the background `fs.remove` runs.
     */
    const renameSpy = vi.spyOn(fs, "rename");

    await resetIsolateDir(isolateDir, { trashParentDir: packageParent });

    expect(renameSpy).toHaveBeenCalledTimes(1);
    const [, renamedTo] = renameSpy.mock.calls[0]!;
    expect(path.dirname(renamedTo as string)).toBe(packageParent);
    expect(path.basename(renamedTo as string)).toMatch(
      /^\.api-isolate\.trash-/,
    );

    /** The original target package dir contains nothing but a fresh empty isolate dir. */
    expect(await fs.readdir(path.dirname(isolateDir))).toEqual(["isolate"]);
    expect(await fs.readdir(isolateDir)).toEqual([]);

    renameSpy.mockRestore();

    await waitFor(async () => {
      const entries = await fs.readdir(packageParent);
      return entries.every((entry) => !entry.includes(".trash-"));
    });
  });

  it("sweeps leftover trash from previous runs", async () => {
    const packageParent = path.join(tempDir, "packages");
    const isolateDir = path.join(packageParent, "api", "isolate");
    await fs.ensureDir(isolateDir);

    /** Simulate debris left behind by a previously killed run. */
    const stale1 = path.join(packageParent, ".api-isolate.trash-9999-aabbccdd");
    const stale2 = path.join(packageParent, ".api-isolate.trash-9998-eeff0011");
    await fs.ensureDir(stale1);
    await fs.ensureDir(stale2);
    await fs.writeFile(path.join(stale1, "junk"), "junk");

    /** Unrelated sibling that must be left alone. */
    const sibling = path.join(packageParent, "web");
    await fs.ensureDir(sibling);

    await resetIsolateDir(isolateDir, { trashParentDir: packageParent });

    /** Eventually both the stale entries and any new trash are gone. */
    await waitFor(async () => {
      const entries = await fs.readdir(packageParent);
      return entries.every((entry) => !entry.includes(".trash-"));
    });

    expect(fs.existsSync(sibling)).toBe(true);
  });

  it("only sweeps trash matching this isolateDir's stem", async () => {
    const packageParent = path.join(tempDir, "packages");
    const isolateDir = path.join(packageParent, "api", "isolate");
    await fs.ensureDir(isolateDir);

    /** Trash from a different package's isolate run. */
    const otherTrash = path.join(
      packageParent,
      ".web-isolate.trash-1234-deadbeef",
    );
    await fs.ensureDir(otherTrash);

    await resetIsolateDir(isolateDir, { trashParentDir: packageParent });

    /** The sweep filter is keyed on the stem, so other packages' trash stays. */
    expect(fs.existsSync(otherTrash)).toBe(true);
  });

  it("falls back to recursive delete when rename fails", async () => {
    const isolateDir = path.join(tempDir, "package", "isolate");
    await fs.ensureDir(isolateDir);
    await fs.writeFile(path.join(isolateDir, "stale.txt"), "stale");

    const renameSpy = vi
      .spyOn(fs, "rename")
      .mockRejectedValueOnce(
        Object.assign(new Error("EXDEV"), { code: "EXDEV" }),
      );

    await resetIsolateDir(isolateDir);

    expect(renameSpy).toHaveBeenCalledTimes(1);
    expect(fs.existsSync(isolateDir)).toBe(true);
    expect(await fs.readdir(isolateDir)).toEqual([]);

    renameSpy.mockRestore();
  });
});
