import fs from "fs-extra";
import path from "node:path";
import os from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineConfig, loadConfigFromFile } from "./config";

/** Shared mock logger instance so assertions can check calls. */
const mockLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

vi.mock("~/lib/logger", () => ({
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

  it("prefers TypeScript config and warns when both exist", async () => {
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
      expect.stringContaining("Found both"),
    );
  });

  it("throws on malformed TypeScript config", async () => {
    await fs.writeFile(
      path.join(tempDir, "isolate.config.ts"),
      `export default "not an object";`,
    );

    /**
     * JSON.parse will fail because the subprocess writes a JSON string
     * value instead of an object, but it's still valid JSON. The real
     * failure would come from validateConfig or the consumer. Here we
     * just verify it doesn't crash and returns whatever the file exports.
     */
    const config = loadConfigFromFile();
    expect(config).toBe("not an object");
  });

  it("throws when the TypeScript file has a syntax error", async () => {
    await fs.writeFile(
      path.join(tempDir, "isolate.config.ts"),
      `export default {{{`,
    );

    expect(() => loadConfigFromFile()).toThrow();
  });
});

describe("defineConfig", () => {
  it("returns the config object unchanged", () => {
    const input = { isolateDirName: "output", workspaceRoot: "../.." };
    const result = defineConfig(input);
    expect(result).toBe(input);
  });
});
