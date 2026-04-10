import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { detectMonorepo } from "./detect-monorepo";

describe("detectMonorepo", () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "detect-monorepo-"));
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("detects a pnpm workspace via pnpm-workspace.yaml", () => {
    fs.writeFileSync(
      path.join(tmpRoot, "pnpm-workspace.yaml"),
      "packages:\n  - 'packages/*'\n",
    );
    fs.writeFileSync(
      path.join(tmpRoot, "package.json"),
      JSON.stringify({ name: "root", version: "1.0.0" }),
    );

    const result = detectMonorepo(tmpRoot);

    expect(result).toEqual({
      rootDir: tmpRoot,
      kind: "pnpm",
    });
  });

  it("detects a workspaces array in package.json (npm/yarn/bun)", () => {
    fs.writeFileSync(
      path.join(tmpRoot, "package.json"),
      JSON.stringify({
        name: "root",
        version: "1.0.0",
        workspaces: ["packages/*"],
      }),
    );

    const result = detectMonorepo(tmpRoot);

    expect(result).toEqual({
      rootDir: tmpRoot,
      kind: "workspaces",
    });
  });

  it("detects a workspaces object form in package.json (yarn nohoist)", () => {
    fs.writeFileSync(
      path.join(tmpRoot, "package.json"),
      JSON.stringify({
        name: "root",
        version: "1.0.0",
        workspaces: { packages: ["packages/*"], nohoist: [] },
      }),
    );

    const result = detectMonorepo(tmpRoot);

    expect(result).toEqual({
      rootDir: tmpRoot,
      kind: "workspaces",
    });
  });

  it("detects a rush workspace via rush.json", () => {
    fs.writeFileSync(path.join(tmpRoot, "rush.json"), "{}");

    const result = detectMonorepo(tmpRoot);

    expect(result).toEqual({
      rootDir: tmpRoot,
      kind: "rush",
    });
  });

  it("returns null for a standalone package with no workspace markers", () => {
    fs.writeFileSync(
      path.join(tmpRoot, "package.json"),
      JSON.stringify({ name: "standalone", version: "1.0.0" }),
    );

    const result = detectMonorepo(tmpRoot);

    expect(result).toBeNull();
  });

  it("finds a marker two levels up from the start directory", () => {
    fs.writeFileSync(
      path.join(tmpRoot, "pnpm-workspace.yaml"),
      "packages:\n  - 'packages/*'\n",
    );
    const nested = path.join(tmpRoot, "packages", "api");
    fs.mkdirSync(nested, { recursive: true });
    fs.writeFileSync(
      path.join(nested, "package.json"),
      JSON.stringify({ name: "api", version: "1.0.0" }),
    );

    const result = detectMonorepo(nested);

    expect(result).toEqual({
      rootDir: tmpRoot,
      kind: "pnpm",
    });
  });

  it("stops searching after MAX_DEPTH (4) levels", () => {
    fs.writeFileSync(
      path.join(tmpRoot, "pnpm-workspace.yaml"),
      "packages:\n  - 'apps/*/functions/src'\n",
    );
    const tooDeep = path.join(tmpRoot, "apps", "firebase", "functions", "src");
    fs.mkdirSync(tooDeep, { recursive: true });

    const result = detectMonorepo(tooDeep);

    expect(result).toBeNull();
  });

  it("finds a marker exactly at MAX_DEPTH (3 levels up)", () => {
    fs.writeFileSync(
      path.join(tmpRoot, "pnpm-workspace.yaml"),
      "packages:\n  - 'apps/*/functions'\n",
    );
    const deep = path.join(tmpRoot, "apps", "firebase", "functions");
    fs.mkdirSync(deep, { recursive: true });

    const result = detectMonorepo(deep);

    expect(result).toEqual({
      rootDir: tmpRoot,
      kind: "pnpm",
    });
  });

  it("parses a package.json containing comments and trailing commas", () => {
    fs.writeFileSync(
      path.join(tmpRoot, "package.json"),
      [
        "{",
        "  // root manifest",
        '  "name": "root",',
        '  "version": "1.0.0",',
        '  "workspaces": ["packages/*"],',
        "}",
      ].join("\n"),
    );

    const result = detectMonorepo(tmpRoot);

    expect(result).toEqual({
      rootDir: tmpRoot,
      kind: "workspaces",
    });
  });

  it("ignores a malformed package.json and continues upward", () => {
    fs.writeFileSync(
      path.join(tmpRoot, "pnpm-workspace.yaml"),
      "packages:\n  - 'packages/*'\n",
    );
    const nested = path.join(tmpRoot, "packages", "api");
    fs.mkdirSync(nested, { recursive: true });
    fs.writeFileSync(path.join(nested, "package.json"), "{ not valid json");

    const result = detectMonorepo(nested);

    expect(result).toEqual({
      rootDir: tmpRoot,
      kind: "pnpm",
    });
  });

  it("does not match a package.json without a workspaces field", () => {
    const nested = path.join(tmpRoot, "subdir");
    fs.mkdirSync(nested);
    fs.writeFileSync(
      path.join(tmpRoot, "package.json"),
      JSON.stringify({ name: "root", version: "1.0.0" }),
    );
    fs.writeFileSync(
      path.join(nested, "package.json"),
      JSON.stringify({ name: "child", version: "1.0.0" }),
    );

    const result = detectMonorepo(nested);

    expect(result).toBeNull();
  });
});
