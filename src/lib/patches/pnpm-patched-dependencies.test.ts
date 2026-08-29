import { describe, expect, it } from "vitest";
import type { PatchFile } from "#/lib/types";
import {
  getPnpmPatchedDependenciesOutput,
  usesPnpmWorkspacePatchedDependencies,
} from "./pnpm-patched-dependencies";

const copiedPatches: Record<string, PatchFile> = {
  "left-pad@1.3.0": {
    path: "patches/left-pad@1.3.0.patch",
    hash: "sha256-patched",
  },
};

describe("usesPnpmWorkspacePatchedDependencies", () => {
  it("uses workspace patch paths from pnpm 11 onwards", () => {
    expect(usesPnpmWorkspacePatchedDependencies(10)).toBe(false);
    expect(usesPnpmWorkspacePatchedDependencies(11)).toBe(true);
    expect(usesPnpmWorkspacePatchedDependencies(Number.NaN)).toBe(false);
  });
});

describe("getPnpmPatchedDependenciesOutput", () => {
  it("returns pnpm 10 lockfile and manifest patch paths", () => {
    expect(
      getPnpmPatchedDependenciesOutput({
        majorVersion: 10,
        copiedPatches,
      }),
    ).toEqual({
      lockfile: copiedPatches,
      manifest: {
        "left-pad@1.3.0": "patches/left-pad@1.3.0.patch",
      },
    });
  });

  it("returns pnpm 11 lockfile hashes and workspace patch paths", () => {
    expect(
      getPnpmPatchedDependenciesOutput({
        majorVersion: 11,
        copiedPatches,
      }),
    ).toEqual({
      lockfile: { "left-pad@1.3.0": "sha256-patched" },
      workspace: {
        "left-pad@1.3.0": "patches/left-pad@1.3.0.patch",
      },
    });
  });

  it("does not create patch settings when no patches were copied", () => {
    expect(getPnpmPatchedDependenciesOutput({ majorVersion: 11 })).toEqual({});
  });
});
