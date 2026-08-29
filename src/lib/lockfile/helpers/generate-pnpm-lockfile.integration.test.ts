import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import { parseAllDocuments } from "yaml";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PatchFile } from "#/lib/types";
import { generatePnpmLockfile } from "./generate-pnpm-lockfile";

const FIXTURES_DIR = path.join(import.meta.dirname, "__fixtures__");

/**
 * Copy a fixture's `workspace/` tree into a fresh tmp directory so the
 * integration test runs the real `@pnpm/lockfile.fs` reader and writer against
 * real files without polluting the checked-in fixture.
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

/**
 * The isolate output is written as a YAML stream, so read it back as one and
 * return the parsed documents in order.
 */
async function readLockfileDocuments(isolateDir: string) {
  const content = await fs.readFile(
    path.join(isolateDir, "pnpm-lock.yaml"),
    "utf8",
  );

  return {
    content,
    documents: parseAllDocuments(content).map(
      (document) => document.toJS() as Record<string, unknown>,
    ),
  };
}

/** The root importer of a parsed lockfile document, as a plain record */
function rootImporterOf(document: Record<string, unknown> | undefined) {
  const importers = (document?.importers ?? {}) as Record<string, unknown>;

  return importers["."] as Record<string, unknown> | undefined;
}

/**
 * Reproduction of https://github.com/0x80/isolate-package/issues/205.
 *
 * The `pnpm-two-document` fixture is a `pnpm-lock.yaml` captured from a real
 * pnpm 12 install: a stream of two YAML documents, an env document pinning the
 * package manager followed by the project document. The
 * `pnpm-config-dependencies` fixture is that file hand-edited to add a config
 * dependency, so its integrity hashes are placeholders rather than real ones —
 * it reproduces the shape, which is all these assertions read. Nothing is
 * mocked: the point is that the reader accepts the stream, which
 * `js-yaml.load()` in `@pnpm/lockfile-file@9` did not.
 *
 * These assert the structure of the emitted lockfile, not that pnpm accepts it:
 * running a real `pnpm install --frozen-lockfile` would need pnpm 12 and the
 * network in CI. That end of the contract is verified by hand against a real
 * pnpm 12 workspace when this code changes.
 */
describe("generatePnpmLockfile integration", () => {
  let cleanupPaths: string[] = [];

  beforeEach(() => {
    cleanupPaths = [];
  });

  afterEach(async () => {
    for (const p of cleanupPaths) {
      await fs.remove(p).catch(() => undefined);
    }
  });

  async function isolate({
    packageManager,
    fixture = "pnpm-two-document",
    mutateLockfile,
    majorVersion = 12,
    targetPackageName = "svc",
    targetPackageRelativePath = "apps/svc",
    patchedDependencies,
  }: {
    packageManager: string | undefined;
    fixture?: string;
    /** Rewrite the workspace lockfile before isolating, to shape its env document */
    mutateLockfile?: (lockfile: string) => string;
    majorVersion?: number;
    targetPackageName?: string;
    targetPackageRelativePath?: string;
    patchedDependencies?: Record<string, PatchFile>;
  }) {
    const { tmpBase, workspaceRoot } = await setupFixture(fixture);
    cleanupPaths.push(tmpBase);

    if (mutateLockfile) {
      const lockfilePath = path.join(workspaceRoot, "pnpm-lock.yaml");
      await fs.writeFile(
        lockfilePath,
        mutateLockfile(await fs.readFile(lockfilePath, "utf8")),
      );
    }

    const targetPackageDir = path.join(
      workspaceRoot,
      targetPackageRelativePath,
    );
    const isolateDir = path.join(targetPackageDir, "isolate");
    await fs.ensureDir(isolateDir);

    await generatePnpmLockfile({
      workspaceRootDir: workspaceRoot,
      targetPackageDir,
      isolateDir,
      internalDepPackageNames: [],
      packagesRegistry: {},
      targetPackageManifest: {
        name: targetPackageName,
        version: "1.0.0",
        dependencies: { "left-pad": "1.3.0" },
        ...(packageManager ? { packageManager } : {}),
      },
      majorVersion,
      includeDevDependencies: false,
      patchedDependencies,
    });

    return readLockfileDocuments(isolateDir);
  }

  it("reads the two-document lockfile pnpm 12 writes", async () => {
    const { documents } = await isolate({ packageManager: "pnpm@12.0.0" });

    const projectDocument = documents.at(-1);

    expect(projectDocument?.lockfileVersion).toBe("9.0");
    expect(rootImporterOf(projectDocument)).toMatchObject({
      dependencies: { "left-pad": { specifier: "1.3.0", version: "1.3.0" } },
    });
  });

  it("writes patched dependencies in pnpm 10's object format", async () => {
    const { documents } = await isolate({
      packageManager: "pnpm@10.0.0",
      majorVersion: 10,
      patchedDependencies: {
        "left-pad@1.3.0": {
          path: "patches/left-pad@1.3.0.patch",
          hash: "sha256-pnpm10",
        },
      },
    });

    expect(documents.at(-1)?.patchedDependencies).toEqual({
      "left-pad@1.3.0": {
        path: "patches/left-pad@1.3.0.patch",
        hash: "sha256-pnpm10",
      },
    });
  });

  it("writes patched dependencies in pnpm 12's hash format", async () => {
    const { documents } = await isolate({
      packageManager: "pnpm@12.0.0",
      patchedDependencies: {
        "left-pad@1.3.0": {
          path: "patches/left-pad@1.3.0.patch",
          hash: "sha256-pnpm12",
        },
      },
    });

    expect(documents.at(-1)?.patchedDependencies).toEqual({
      "left-pad@1.3.0": "sha256-pnpm12",
    });
  });

  it.each([
    {
      fixture: "pnpm-patched-dependencies-10",
      majorVersion: 10,
      expected: {
        "left-pad@1.3.0": {
          path: "patches/left-pad@1.3.0.patch",
          hash: "9e0f13b98377d5c4c2e7b7b6ba81f2619588134e4df976f8b79cc200b02cf500",
        },
      },
    },
    {
      fixture: "pnpm-patched-dependencies-12",
      majorVersion: 12,
      expected: {
        "left-pad@1.3.0":
          "9e0f13b98377d5c4c2e7b7b6ba81f2619588134e4df976f8b79cc200b02cf500",
      },
    },
  ])(
    "writes patch metadata from a real pnpm $majorVersion workspace",
    async ({ fixture, majorVersion, expected }) => {
      const { documents } = await isolate({
        packageManager: `pnpm@${majorVersion}.0.0`,
        fixture,
        majorVersion,
        targetPackageName: "functions",
        targetPackageRelativePath: "packages/functions",
        patchedDependencies: {
          "left-pad@1.3.0": {
            path: "patches/left-pad@1.3.0.patch",
            hash: "9e0f13b98377d5c4c2e7b7b6ba81f2619588134e4df976f8b79cc200b02cf500",
          },
        },
      });

      expect(documents.at(-1)?.patchedDependencies).toEqual(expected);

      const patchHash =
        "9e0f13b98377d5c4c2e7b7b6ba81f2619588134e4df976f8b79cc200b02cf500";
      const patchedVersion = `1.3.0(patch_hash=${patchHash})`;
      const projectDocument = documents.at(-1);

      expect(rootImporterOf(projectDocument)).toMatchObject({
        dependencies: {
          "left-pad": { specifier: "1.3.0", version: patchedVersion },
        },
      });
      expect(projectDocument?.snapshots).toHaveProperty(
        `left-pad@${patchedVersion}`,
      );
    },
  );

  it("carries the env document into the isolated lockfile", async () => {
    const { content, documents } = await isolate({
      packageManager: "pnpm@12.0.0",
    });

    expect(documents).toHaveLength(2);
    expect(content.startsWith("---\n")).toBe(true);

    expect(rootImporterOf(documents[0])).toMatchObject({
      packageManagerDependencies: {
        pnpm: { specifier: "12.0.0", version: "12.0.0" },
      },
    });
  });

  it("omits the env document when the output manifest drops packageManager", async () => {
    const { content, documents } = await isolate({ packageManager: undefined });

    expect(documents).toHaveLength(1);
    expect(content.startsWith("---\n")).toBe(false);
    expect(rootImporterOf(documents[0])).toBeDefined();
  });

  /**
   * `pnpm-workspace.yaml` is copied to the isolate verbatim, so its
   * `configDependencies` specifiers keep being declared there. Their
   * resolutions live only in the env document, which therefore has to survive
   * `omitPackageManager` even though the package manager pin does not.
   */
  it("keeps the env document for its config dependencies when packageManager is dropped", async () => {
    const { documents } = await isolate({
      packageManager: undefined,
      fixture: "pnpm-config-dependencies",
    });

    expect(documents).toHaveLength(2);

    const rootImporter = rootImporterOf(documents[0]);

    expect(rootImporter?.configDependencies).toMatchObject({
      "my-config": { specifier: "1.0.0", version: "1.0.0" },
    });
    expect(rootImporter).not.toHaveProperty("packageManagerDependencies");
  });

  /**
   * The reader returns null for a lockfile with no env document, and declines
   * one it cannot recognize. Neither may abort the run, and only the second
   * costs the output anything — so both are exercised against real files.
   */
  it("emits a single-document lockfile when the source has no env document", async () => {
    const { content, documents } = await isolate({
      packageManager: "pnpm@12.0.0",
      mutateLockfile: (lockfile) =>
        lockfile.split("\n---\n").slice(1).join("\n---\n"),
    });

    expect(documents).toHaveLength(1);
    expect(content.startsWith("---\n")).toBe(false);
    expect(rootImporterOf(documents[0])).toBeDefined();
  });

  it("still emits the project document when the env document is unreadable", async () => {
    const { documents } = await isolate({
      packageManager: "pnpm@12.0.0",
      mutateLockfile: (lockfile) =>
        `---\n\tthis is not: valid: yaml\n---\n${lockfile.split("\n---\n").slice(1).join("\n---\n")}`,
    });

    expect(documents).toHaveLength(1);
    expect(rootImporterOf(documents[0])).toMatchObject({
      dependencies: { "left-pad": { specifier: "1.3.0", version: "1.3.0" } },
    });
  });

  it("keeps both env pins when packageManager is retained", async () => {
    const { documents } = await isolate({
      packageManager: "pnpm@12.0.0",
      fixture: "pnpm-config-dependencies",
    });

    const rootImporter = rootImporterOf(documents[0]);

    expect(rootImporter?.configDependencies).toHaveProperty("my-config");
    expect(rootImporter?.packageManagerDependencies).toHaveProperty("pnpm");
  });
});
