import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import { parseAllDocuments } from "yaml";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
 * The fixture holds a real `pnpm-lock.yaml` written by pnpm 12, which is a
 * stream of two YAML documents: an env document pinning the package manager,
 * followed by the project document. Nothing here is mocked — the point of the
 * test is that the reader actually accepts that stream, which `js-yaml.load()`
 * in `@pnpm/lockfile-file@9` did not.
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
  }: {
    packageManager: string | undefined;
    fixture?: string;
  }) {
    const { tmpBase, workspaceRoot } = await setupFixture(fixture);
    cleanupPaths.push(tmpBase);

    const targetPackageDir = path.join(workspaceRoot, "apps/svc");
    const isolateDir = path.join(targetPackageDir, "isolate");
    await fs.ensureDir(isolateDir);

    await generatePnpmLockfile({
      workspaceRootDir: workspaceRoot,
      targetPackageDir,
      isolateDir,
      internalDepPackageNames: [],
      packagesRegistry: {},
      targetPackageManifest: {
        name: "svc",
        version: "1.0.0",
        dependencies: { "left-pad": "1.3.0" },
        ...(packageManager ? { packageManager } : {}),
      },
      majorVersion: 12,
      includeDevDependencies: false,
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
