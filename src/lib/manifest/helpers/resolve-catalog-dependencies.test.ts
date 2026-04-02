import os from "node:os";
import path from "node:path";
import fs from "fs-extra";
import yaml from "yaml";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("~/lib/logger", () => ({
  useLogger: vi.fn(() => ({
    debug: vi.fn(),
    warn: vi.fn(),
  })),
}));

const { resolveCatalogDependencies } = await import(
  "./resolve-catalog-dependencies"
);

/**
 * Creates a temporary directory with optional pnpm-workspace.yaml and
 * package.json for testing catalog resolution.
 */
async function createTempWorkspace({
  workspaceYaml,
  packageJson,
}: {
  workspaceYaml?: object;
  packageJson?: object;
}): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "isolate-test-"));

  if (workspaceYaml !== undefined) {
    await fs.writeFile(
      path.join(dir, "pnpm-workspace.yaml"),
      yaml.stringify(workspaceYaml),
      "utf-8",
    );
  }

  // Always write a minimal package.json so the fallback doesn't throw
  const manifest = packageJson ?? { name: "root", version: "0.0.0" };
  await fs.writeJson(path.join(dir, "package.json"), manifest);

  return dir;
}

describe("resolveCatalogDependencies", () => {
  let tmpDir: string;

  afterEach(async () => {
    if (tmpDir) {
      await fs.remove(tmpDir);
    }
  });

  describe("with no dependencies", () => {
    it("returns undefined when dependencies is undefined", async () => {
      tmpDir = await createTempWorkspace({});
      const result = await resolveCatalogDependencies(undefined, tmpDir);
      expect(result).toBeUndefined();
    });
  });

  describe("pnpm-workspace.yaml: default catalog (catalog:)", () => {
    it("resolves catalog: specifiers from pnpm-workspace.yaml", async () => {
      tmpDir = await createTempWorkspace({
        workspaceYaml: {
          packages: ["packages/*"],
          catalog: {
            react: "^18.3.1",
            typescript: "^5.0.0",
          },
        },
      });

      const result = await resolveCatalogDependencies(
        { react: "catalog:", typescript: "catalog:", lodash: "^4.0.0" },
        tmpDir,
      );

      expect(result).toEqual({
        react: "^18.3.1",
        typescript: "^5.0.0",
        lodash: "^4.0.0",
      });
    });

    it("also handles catalog:default as the default catalog name", async () => {
      tmpDir = await createTempWorkspace({
        workspaceYaml: {
          packages: ["packages/*"],
          catalogs: {
            default: {
              react: "^18.3.1",
            },
          },
        },
      });

      const result = await resolveCatalogDependencies(
        { react: "catalog:default" },
        tmpDir,
      );

      expect(result).toEqual({ react: "^18.3.1" });
    });
  });

  describe("pnpm-workspace.yaml: named catalogs (catalog:<name>)", () => {
    it("resolves named catalog specifiers from pnpm-workspace.yaml", async () => {
      tmpDir = await createTempWorkspace({
        workspaceYaml: {
          packages: ["packages/*"],
          catalogs: {
            react18: {
              react: "^18.3.1",
              "react-dom": "^18.3.1",
            },
            react19: {
              react: "^19.0.0",
            },
          },
        },
      });

      const result = await resolveCatalogDependencies(
        {
          react: "catalog:react18",
          "react-dom": "catalog:react18",
        },
        tmpDir,
      );

      expect(result).toEqual({
        react: "^18.3.1",
        "react-dom": "^18.3.1",
      });
    });
  });

  describe("pnpm-workspace.yaml: missing package in catalog", () => {
    it("keeps original specifier and warns when package not found in catalog", async () => {
      tmpDir = await createTempWorkspace({
        workspaceYaml: {
          packages: ["packages/*"],
          catalog: { react: "^18.0.0" },
        },
      });

      const result = await resolveCatalogDependencies(
        { react: "catalog:", "missing-pkg": "catalog:" },
        tmpDir,
      );

      expect(result).toEqual({
        react: "^18.0.0",
        "missing-pkg": "catalog:", // kept as-is with a warning
      });
    });
  });

  describe("package.json fallback (Bun format)", () => {
    it("resolves catalog: from root-level catalog field in package.json", async () => {
      tmpDir = await createTempWorkspace({
        packageJson: {
          name: "root",
          version: "0.0.0",
          catalog: {
            react: "^18.3.1",
          },
        },
      });

      const result = await resolveCatalogDependencies(
        { react: "catalog:" },
        tmpDir,
      );

      expect(result).toEqual({ react: "^18.3.1" });
    });

    it("resolves catalog: from workspaces.catalog in package.json", async () => {
      tmpDir = await createTempWorkspace({
        packageJson: {
          name: "root",
          version: "0.0.0",
          workspaces: {
            packages: ["packages/*"],
            catalog: {
              typescript: "^5.4.0",
            },
          },
        },
      });

      const result = await resolveCatalogDependencies(
        { typescript: "catalog:" },
        tmpDir,
      );

      expect(result).toEqual({ typescript: "^5.4.0" });
    });
  });

  describe("pnpm-workspace.yaml without catalog fields", () => {
    it("falls back to package.json when pnpm-workspace.yaml has no catalog", async () => {
      tmpDir = await createTempWorkspace({
        workspaceYaml: {
          // No catalog or catalogs field - just packages
          packages: ["packages/*"],
        },
        packageJson: {
          name: "root",
          version: "0.0.0",
          catalog: { react: "^18.0.0" },
        },
      });

      const result = await resolveCatalogDependencies(
        { react: "catalog:" },
        tmpDir,
      );

      expect(result).toEqual({ react: "^18.0.0" });
    });
  });

  describe("no catalog defined anywhere", () => {
    it("returns dependencies as-is when no catalog is found", async () => {
      tmpDir = await createTempWorkspace({});

      const result = await resolveCatalogDependencies(
        { react: "^18.0.0", typescript: "^5.0.0" },
        tmpDir,
      );

      expect(result).toEqual({
        react: "^18.0.0",
        typescript: "^5.0.0",
      });
    });
  });

  describe("non-catalog specifiers", () => {
    it("leaves non-catalog specifiers unchanged", async () => {
      tmpDir = await createTempWorkspace({
        workspaceYaml: {
          packages: ["packages/*"],
          catalog: { react: "^18.0.0" },
        },
      });

      const result = await resolveCatalogDependencies(
        {
          react: "catalog:",
          lodash: "^4.0.0",
          typescript: "workspace:*",
        },
        tmpDir,
      );

      expect(result).toEqual({
        react: "^18.0.0",
        lodash: "^4.0.0",
        typescript: "workspace:*",
      });
    });
  });
});
