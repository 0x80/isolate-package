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

  /**
   * Covers the internal-dep overlay path: when an internal dep's manifest
   * has been adapted (workspace references rewritten to `file:`), that
   * overlay must propagate into the isolated lockfile's entry for that
   * dep — otherwise `npm ci` would try to resolve `utils: "*"` from the
   * registry instead of linking the local `../utils` directory.
   */
  it("rewrites workspace refs to file: refs in internal dep lockfile entries", async () => {
    const { tmpBase, workspaceRoot } = await setupFixture("internal-deps");
    cleanupPaths.push(tmpBase);

    const isolateDir = path.join(workspaceRoot, "packages/api/isolate");
    await fs.ensureDir(isolateDir);

    /**
     * Simulate what adaptInternalPackageManifests + unpackDependencies
     * produce: the isolate dir contains the target manifest at the root
     * and each internal dep's adapted manifest at its rootRelativeDir.
     */
    await fs.writeJson(path.join(isolateDir, "package.json"), {
      name: "api",
      version: "1.0.0",
      dependencies: {
        shared: "file:./packages/shared",
        semver: "^7.6.0",
      },
    });

    await fs.ensureDir(path.join(isolateDir, "packages/shared"));
    await fs.writeJson(path.join(isolateDir, "packages/shared/package.json"), {
      name: "shared",
      version: "1.0.0",
      dependencies: {
        utils: "file:../utils",
        ms: "^2.1.3",
      },
    });

    await fs.ensureDir(path.join(isolateDir, "packages/utils"));
    await fs.writeJson(path.join(isolateDir, "packages/utils/package.json"), {
      name: "utils",
      version: "1.0.0",
      dependencies: {
        debug: "^4.3.0",
      },
    });

    await generateNpmLockfile({
      workspaceRootDir: workspaceRoot,
      isolateDir,
      targetPackageName: "api",
      targetPackageManifest: {
        name: "api",
        version: "1.0.0",
        dependencies: {
          shared: "file:./packages/shared",
          semver: "^7.6.0",
        },
      },
      packagesRegistry: {
        shared: {
          absoluteDir: path.join(workspaceRoot, "packages/shared"),
          rootRelativeDir: "packages/shared",
          manifest: { name: "shared", version: "1.0.0" },
        },
        utils: {
          absoluteDir: path.join(workspaceRoot, "packages/utils"),
          rootRelativeDir: "packages/utils",
          manifest: { name: "utils", version: "1.0.0" },
        },
      },
      internalDepPackageNames: ["shared", "utils"],
    });

    const output = (await fs.readJson(
      path.join(isolateDir, "package-lock.json"),
    )) as {
      packages: Record<
        string,
        {
          version?: string;
          dependencies?: Record<string, string>;
          link?: boolean;
          resolved?: string;
        }
      >;
    };

    /** Internal dep entries are present at their original relative paths. */
    expect(output.packages["packages/shared"]).toBeDefined();
    expect(output.packages["packages/utils"]).toBeDefined();

    /** The adapted manifest's file: refs are applied to shared's entry. */
    expect(output.packages["packages/shared"]!.dependencies).toEqual({
      utils: "file:../utils",
      ms: "^2.1.3",
    });

    /** utils keeps its external-only deps unchanged (no cross-internal refs). */
    expect(output.packages["packages/utils"]!.dependencies).toEqual({
      debug: "^4.3.0",
    });

    /** Link entries for internal deps point at the expected relative paths. */
    expect(output.packages["node_modules/shared"]).toEqual({
      resolved: "packages/shared",
      link: true,
    });
    expect(output.packages["node_modules/utils"]).toEqual({
      resolved: "packages/utils",
      link: true,
    });

    /** External transitive deps needed by the closure are preserved verbatim. */
    expect(output.packages["node_modules/semver"]?.version).toBe("7.7.4");
    expect(output.packages["node_modules/ms"]?.version).toBe("2.1.3");
    expect(output.packages["node_modules/debug"]?.version).toMatch(/^4\./);
  });
});
