import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PatchFile } from "#/lib/types";
import { writeIsolatePnpmWorkspace } from "./write-isolate-pnpm-workspace";

vi.mock("fs-extra", () => ({
  default: {
    copyFileSync: vi.fn(),
  },
}));

vi.mock("#/lib/utils", () => ({
  readTypedYamlSync: vi.fn(),
  writeTypedYamlSync: vi.fn(),
}));

const fs = vi.mocked((await import("fs-extra")).default);
const { readTypedYamlSync, writeTypedYamlSync } = vi.mocked(
  await import("#/lib/utils"),
);

const workspaceRootDir = "/workspace";
const isolateDir = "/workspace/isolate";

describe("writeIsolatePnpmWorkspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("retains only the patches that were copied", () => {
    readTypedYamlSync.mockReturnValue({
      packages: ["packages/*"],
      patchedDependencies: {
        "lodash@4.17.21": "patches/lodash@4.17.21.patch",
        "react@18.2.0": "patches/react@18.2.0.patch",
        "axios@1.6.0": "patches/axios@1.6.0.patch",
      },
    });

    const copiedPatches: Record<string, PatchFile> = {
      "lodash@4.17.21": {
        path: "patches/lodash@4.17.21.patch",
        hash: "abc",
      },
    };

    writeIsolatePnpmWorkspace({
      workspaceRootDir,
      isolateDir,
      copiedPatches,
    });

    expect(fs.copyFileSync).not.toHaveBeenCalled();
    expect(writeTypedYamlSync).toHaveBeenCalledTimes(1);
    expect(writeTypedYamlSync).toHaveBeenCalledWith(
      "/workspace/isolate/pnpm-workspace.yaml",
      {
        packages: ["packages/*"],
        patchedDependencies: {
          "lodash@4.17.21": "patches/lodash@4.17.21.patch",
        },
      },
    );
  });

  it("removes the patchedDependencies field when no patches were copied", () => {
    readTypedYamlSync.mockReturnValue({
      packages: ["packages/*"],
      patchedDependencies: {
        "lodash@4.17.21": "patches/lodash@4.17.21.patch",
      },
    });

    writeIsolatePnpmWorkspace({
      workspaceRootDir,
      isolateDir,
      copiedPatches: {},
    });

    expect(fs.copyFileSync).not.toHaveBeenCalled();
    expect(writeTypedYamlSync).toHaveBeenCalledWith(
      "/workspace/isolate/pnpm-workspace.yaml",
      { packages: ["packages/*"] },
    );
  });

  it("falls back to a verbatim copy when the file has no patchedDependencies field", () => {
    readTypedYamlSync.mockReturnValue({
      packages: ["packages/*"],
    });

    writeIsolatePnpmWorkspace({
      workspaceRootDir,
      isolateDir,
      copiedPatches: {},
    });

    expect(writeTypedYamlSync).not.toHaveBeenCalled();
    expect(fs.copyFileSync).toHaveBeenCalledWith(
      "/workspace/pnpm-workspace.yaml",
      "/workspace/isolate/pnpm-workspace.yaml",
    );
  });

  it("preserves unrelated top-level fields", () => {
    readTypedYamlSync.mockReturnValue({
      packages: ["packages/*"],
      onlyBuiltDependencies: ["esbuild"],
      overrides: { foo: "1.0.0" },
      patchedDependencies: {
        "lodash@4.17.21": "patches/lodash@4.17.21.patch",
        "react@18.2.0": "patches/react@18.2.0.patch",
      },
    });

    const copiedPatches: Record<string, PatchFile> = {
      "react@18.2.0": { path: "patches/react@18.2.0.patch", hash: "def" },
    };

    writeIsolatePnpmWorkspace({
      workspaceRootDir,
      isolateDir,
      copiedPatches,
    });

    expect(writeTypedYamlSync).toHaveBeenCalledWith(
      "/workspace/isolate/pnpm-workspace.yaml",
      {
        packages: ["packages/*"],
        onlyBuiltDependencies: ["esbuild"],
        overrides: { foo: "1.0.0" },
        patchedDependencies: {
          "react@18.2.0": "patches/react@18.2.0.patch",
        },
      },
    );
  });

  /**
   * Regression test for issue #189: pnpm 11 expresses the build-script policy
   * via `allowBuilds` in pnpm-workspace.yaml (and removes the older
   * `pnpm.onlyBuiltDependencies` / `ignoredBuiltDependencies` fields from
   * package.json). The verbatim copy must carry that field — along with other
   * workspace-level settings like `minimumReleaseAge` — into the isolate
   * output so downstream `pnpm install` honors the same policy.
   */
  it("preserves pnpm 11 workspace settings (allowBuilds, minimumReleaseAge) when no patches are involved", () => {
    readTypedYamlSync.mockReturnValue({
      packages: ["apps/*", "packages/*"],
      allowBuilds: {
        puppeteer: true,
        esbuild: true,
      },
      minimumReleaseAge: 10_080,
    });

    writeIsolatePnpmWorkspace({
      workspaceRootDir,
      isolateDir,
      copiedPatches: {},
    });

    /**
     * With no patchedDependencies in the source yaml, the file is copied
     * verbatim — preserving `allowBuilds` and any other top-level settings.
     */
    expect(writeTypedYamlSync).not.toHaveBeenCalled();
    expect(fs.copyFileSync).toHaveBeenCalledWith(
      "/workspace/pnpm-workspace.yaml",
      "/workspace/isolate/pnpm-workspace.yaml",
    );
  });

  /**
   * When patches are being filtered, the rewrite path must still carry
   * `allowBuilds` into the output yaml — otherwise pnpm 11's build-script
   * policy is silently dropped.
   */
  it("preserves allowBuilds when rewriting to filter patchedDependencies", () => {
    readTypedYamlSync.mockReturnValue({
      packages: ["apps/*", "packages/*"],
      allowBuilds: {
        puppeteer: true,
      },
      patchedDependencies: {
        "lodash@4.17.21": "patches/lodash@4.17.21.patch",
        "axios@1.6.0": "patches/axios@1.6.0.patch",
      },
    });

    const copiedPatches: Record<string, PatchFile> = {
      "lodash@4.17.21": {
        path: "patches/lodash@4.17.21.patch",
        hash: "abc",
      },
    };

    writeIsolatePnpmWorkspace({
      workspaceRootDir,
      isolateDir,
      copiedPatches,
    });

    expect(fs.copyFileSync).not.toHaveBeenCalled();
    expect(writeTypedYamlSync).toHaveBeenCalledWith(
      "/workspace/isolate/pnpm-workspace.yaml",
      {
        packages: ["apps/*", "packages/*"],
        allowBuilds: {
          puppeteer: true,
        },
        patchedDependencies: {
          "lodash@4.17.21": "patches/lodash@4.17.21.patch",
        },
      },
    );
  });

  it("copies verbatim when every patch is kept (preserving comments and order)", () => {
    readTypedYamlSync.mockReturnValue({
      packages: ["packages/*"],
      patchedDependencies: {
        "lodash@4.17.21": "patches/lodash@4.17.21.patch",
        "react@18.2.0": "patches/react@18.2.0.patch",
      },
    });

    const copiedPatches: Record<string, PatchFile> = {
      "lodash@4.17.21": {
        path: "patches/lodash@4.17.21.patch",
        hash: "abc",
      },
      "react@18.2.0": { path: "patches/react@18.2.0.patch", hash: "def" },
    };

    writeIsolatePnpmWorkspace({
      workspaceRootDir,
      isolateDir,
      copiedPatches,
    });

    expect(writeTypedYamlSync).not.toHaveBeenCalled();
    expect(fs.copyFileSync).toHaveBeenCalledWith(
      "/workspace/pnpm-workspace.yaml",
      "/workspace/isolate/pnpm-workspace.yaml",
    );
  });

  it("falls back to a verbatim copy when the yaml cannot be parsed", () => {
    readTypedYamlSync.mockImplementation(() => {
      throw new Error("bad yaml");
    });

    writeIsolatePnpmWorkspace({
      workspaceRootDir,
      isolateDir,
      copiedPatches: {},
    });

    expect(writeTypedYamlSync).not.toHaveBeenCalled();
    expect(fs.copyFileSync).toHaveBeenCalledWith(
      "/workspace/pnpm-workspace.yaml",
      "/workspace/isolate/pnpm-workspace.yaml",
    );
  });
});
