import fs from "fs-extra";
import path from "node:path";
import os from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  defineConfig,
  type IsolateConfigResolved,
  loadConfigFromFile,
  resolveWorkspacePaths,
} from "./config";

/** Shared mock logger instance so assertions can check calls. */
const mockLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

vi.mock("#/lib/logger", () => ({
  useLogger: () => mockLogger,
}));

describe("loadConfigFromFile", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    originalCwd = process.cwd();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "isolate-config-test-"));
    process.chdir(tempDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.remove(tempDir);
  });

  it("returns empty object when no config file exists", () => {
    const config = loadConfigFromFile();
    expect(config).toEqual({});
  });

  it("loads a JSON config file", async () => {
    await fs.writeJson(path.join(tempDir, "isolate.config.json"), {
      isolateDirName: "output",
      workspaceRoot: "../../..",
    });

    const config = loadConfigFromFile();
    expect(config).toEqual({
      isolateDirName: "output",
      workspaceRoot: "../../..",
    });
  });

  it("loads a TypeScript config file", async () => {
    await fs.writeFile(
      path.join(tempDir, "isolate.config.ts"),
      `export default { isolateDirName: "from-ts", workspaceRoot: "../.." };`,
    );

    const config = loadConfigFromFile();
    expect(config).toEqual({
      isolateDirName: "from-ts",
      workspaceRoot: "../..",
    });
  });

  it("loads a TypeScript config file that uses defineConfig", async () => {
    /**
     * The subprocess can't import from "isolate-package" since it's not
     * installed in the temp dir, so we inline the defineConfig identity
     * function to verify the pattern works end-to-end.
     */
    await fs.writeFile(
      path.join(tempDir, "isolate.config.ts"),
      [
        `const defineConfig = (c: Record<string, unknown>) => c;`,
        `export default defineConfig({ isolateDirName: "defined" });`,
      ].join("\n"),
    );

    const config = loadConfigFromFile();
    expect(config).toEqual({ isolateDirName: "defined" });
  });

  it("loads a JavaScript config file", async () => {
    await fs.writeFile(
      path.join(tempDir, "isolate.config.js"),
      `export default { isolateDirName: "from-js", workspaceRoot: "../.." };`,
    );

    const config = loadConfigFromFile();
    expect(config).toEqual({
      isolateDirName: "from-js",
      workspaceRoot: "../..",
    });
  });

  it("prefers TypeScript config and warns when multiple exist", async () => {
    await fs.writeJson(path.join(tempDir, "isolate.config.json"), {
      isolateDirName: "from-json",
    });
    await fs.writeFile(
      path.join(tempDir, "isolate.config.ts"),
      `export default { isolateDirName: "from-ts" };`,
    );

    const config = loadConfigFromFile();
    expect(config).toEqual({ isolateDirName: "from-ts" });
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining("Found multiple config files"),
    );
  });

  it("prefers JavaScript config over JSON", async () => {
    await fs.writeJson(path.join(tempDir, "isolate.config.json"), {
      isolateDirName: "from-json",
    });
    await fs.writeFile(
      path.join(tempDir, "isolate.config.js"),
      `export default { isolateDirName: "from-js" };`,
    );

    const config = loadConfigFromFile();
    expect(config).toEqual({ isolateDirName: "from-js" });
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining("Found multiple config files"),
    );
  });

  it("throws when the config file has no default export", async () => {
    await fs.writeFile(
      path.join(tempDir, "isolate.config.ts"),
      `export const config = { isolateDirName: "oops" };`,
    );

    expect(() => loadConfigFromFile()).toThrow("Failed to load config from");
  });

  it("throws when the default export is not an object", async () => {
    await fs.writeFile(
      path.join(tempDir, "isolate.config.ts"),
      `export default "not an object";`,
    );

    expect(() => loadConfigFromFile()).toThrow("Failed to load config from");
  });

  it("throws when the TypeScript file has a syntax error", async () => {
    await fs.writeFile(
      path.join(tempDir, "isolate.config.ts"),
      `export default {{{`,
    );

    expect(() => loadConfigFromFile()).toThrow("Failed to load config from");
  });
});

describe("defineConfig", () => {
  it("returns the config object unchanged", () => {
    const input = { isolateDirName: "output", workspaceRoot: "../.." };
    const result = defineConfig(input);
    expect(result).toBe(input);
  });
});

describe("resolveWorkspacePaths", () => {
  /** The required config fields; path-related options are added per test. */
  const baseConfig: IsolateConfigResolved = {
    includeDevDependencies: false,
    isolateDirName: "isolate",
    logLevel: "info",
    tsconfigPath: "./tsconfig.json",
    forceNpm: false,
  };

  let tempDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "isolate-paths-test-"));
    /**
     * Resolve symlinks (macOS tmpdir) so comparisons against process.cwd()
     * and detected roots are stable.
     */
    tempDir = await fs.realpath(dir);
    /** Bound upward workspace detection to the fixture. */
    await fs.mkdir(path.join(tempDir, ".git"));
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.remove(tempDir);
  });

  it("treats a relative targetPackagePath as cwd-relative with cwd as workspace root", () => {
    process.chdir(tempDir);

    const result = resolveWorkspacePaths({
      ...baseConfig,
      targetPackagePath: "./packages/functions",
    });

    expect(result.targetPackageDir).toBe(
      path.join(tempDir, "./packages/functions"),
    );
    expect(result.workspaceRootDir).toBe(tempDir);
  });

  it("uses an absolute targetPackagePath independent of cwd and auto-detects the workspace root", async () => {
    await fs.writeFile(
      path.join(tempDir, "pnpm-workspace.yaml"),
      "packages:\n  - packages/*\n",
    );
    const targetPackageDir = path.join(tempDir, "packages", "functions");
    await fs.mkdirp(targetPackageDir);
    await fs.writeFile(
      path.join(targetPackageDir, "package.json"),
      '{"name":"functions"}',
    );
    /** Run from an unrelated directory to prove cwd independence. */
    process.chdir(os.tmpdir());

    const result = resolveWorkspacePaths({
      ...baseConfig,
      targetPackagePath: targetPackageDir,
    });

    expect(result.targetPackageDir).toBe(targetPackageDir);
    expect(result.workspaceRootDir).toBe(tempDir);
  });

  it("honors the workspaceRoot setting for an absolute targetPackagePath", async () => {
    const targetPackageDir = path.join(tempDir, "packages", "functions");
    await fs.mkdirp(targetPackageDir);
    process.chdir(os.tmpdir());

    const result = resolveWorkspacePaths({
      ...baseConfig,
      targetPackagePath: targetPackageDir,
      workspaceRoot: "../..",
    });

    expect(result.targetPackageDir).toBe(targetPackageDir);
    expect(result.workspaceRootDir).toBe(path.join(targetPackageDir, "../.."));
  });

  it("throws for an absolute targetPackagePath when no workspace root is found", async () => {
    const targetPackageDir = path.join(tempDir, "packages", "functions");
    await fs.mkdirp(targetPackageDir);
    process.chdir(os.tmpdir());

    expect(() =>
      resolveWorkspacePaths({
        ...baseConfig,
        targetPackagePath: targetPackageDir,
      }),
    ).toThrow(/Failed to auto-detect monorepo workspace root/);
  });
});
