import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PatchFile } from "~/lib/types";
import { writeIsolatePnpmWorkspace } from "./write-isolate-pnpm-workspace";

vi.mock("fs-extra", () => ({
  default: {
    copyFileSync: vi.fn(),
  },
}));

vi.mock("~/lib/utils", () => ({
  readTypedYamlSync: vi.fn(),
  writeTypedYamlSync: vi.fn(),
}));

const fs = vi.mocked((await import("fs-extra")).default);
const { readTypedYamlSync, writeTypedYamlSync } = vi.mocked(
  await import("~/lib/utils"),
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
