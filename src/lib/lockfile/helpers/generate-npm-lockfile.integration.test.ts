import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { generateNpmLockfile } from "./generate-npm-lockfile";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FIXTURES_DIR = path.join(__dirname, "__fixtures__");

/**
 * Copy a fixture's `workspace/` tree into a fresh tmp directory so that the
 * integration test can run Arborist against real files without polluting the
 * checked-in fixture.
 */
async function setupFixture(name: string) {
  const srcWorkspace = path.join(FIXTURES_DIR, name, "workspace");
  const tmpBase = await fs.mkdtemp(
    path.join(os.tmpdir(), `isolate-package-${name}-`),
  );
  const workspaceRoot = path.join(tmpBase, "workspace");
  await fs.copy(srcWorkspace, workspaceRoot);
  return { tmpBase, workspaceRoot };
}

describe("generateNpmLockfile integration", () => {
  let cleanupPaths: string[] = [];

  beforeEach(() => {
    cleanupPaths = [];
  });

  afterEach(async () => {
    for (const p of cleanupPaths) {
      await fs.remove(p).catch(() => undefined);
    }
  });

  /**
   * Reproduction of https://github.com/0x80/isolate-package/issues/111.
   *
   * The fixture is a real npm workspaces monorepo (produced by `npm install`)
   * where the target package `api` pins `semver@^6` while a sibling `other`
   * pins `semver@^7`. npm hoists 7.7.4 to the root `node_modules/semver` and
   * places 6.3.1 at `packages/api/node_modules/semver` as a nested override.
   *
   * When isolating `api`, the isolated lockfile must surface the nested 6.3.1
   * at the isolate's root `node_modules/semver` (with the original resolved
   * and integrity preserved), and must not include the hoisted 7.7.4 that
   * only `other` needs.
   */
  it("preserves the target's nested dependency version (#111)", async () => {
    const { tmpBase, workspaceRoot } = await setupFixture(
      "nested-version-override",
    );
    cleanupPaths.push(tmpBase);

    const isolateDir = path.join(workspaceRoot, "packages/api/isolate");
    await fs.ensureDir(isolateDir);

    const targetManifest = (await fs.readJson(
      path.join(workspaceRoot, "packages/api/package.json"),
    )) as {
      name: string;
      version: string;
      dependencies: Record<string, string>;
    };

    /** Write the adapted manifest into the isolate dir (no internal deps so no adaptation needed). */
    await fs.writeJson(path.join(isolateDir, "package.json"), targetManifest);

    await generateNpmLockfile({
      workspaceRootDir: workspaceRoot,
      isolateDir,
      targetPackageName: "api",
      targetPackageManifest: targetManifest,
      packagesRegistry: {},
      internalDepPackageNames: [],
    });

    const output = (await fs.readJson(
      path.join(isolateDir, "package-lock.json"),
    )) as {
      name: string;
      version: string;
      lockfileVersion: number;
      packages: Record<
        string,
        { version?: string; resolved?: string; integrity?: string }
      >;
    };

    /** Top-level metadata reflects the target package, not the monorepo root. */
    expect(output.name).toBe("api");
    expect(output.version).toBe("1.0.0");
    expect(output.lockfileVersion).toBe(3);

    /** The nested 6.3.1 is surfaced at the isolate's root node_modules. */
    const semverEntry = output.packages["node_modules/semver"];
    expect(semverEntry?.version).toBe("6.3.1");
    expect(semverEntry?.resolved).toBe(
      "https://registry.npmjs.org/semver/-/semver-6.3.1.tgz",
    );
    expect(semverEntry?.integrity).toMatch(/^sha512-/);

    /** The original nested path must not leak into the output. */
    expect(output.packages["packages/api/node_modules/semver"]).toBeUndefined();

    /** The sibling workspace and its hoisted semver@7 must not appear. */
    expect(output.packages["packages/other"]).toBeUndefined();
    expect(output.packages["node_modules/other"]).toBeUndefined();

    /** No stray references to the unrelated hoisted 7.7.4. */
    for (const entry of Object.values(output.packages)) {
      if (entry.version === "7.7.4") {
        throw new Error(
          "isolated lockfile unexpectedly contains hoisted semver 7.7.4",
        );
      }
    }
  });
});
