import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { collectInstalledNamesFromBunLockfile } from "./collect-installed-names-bun";

vi.mock("fs-extra", () => ({
  default: {
    existsSync: vi.fn(),
  },
}));

vi.mock("~/lib/utils", () => ({
  readTypedJsonSync: vi.fn(),
}));

const fs = vi.mocked((await import("fs-extra")).default);
const { readTypedJsonSync } = vi.mocked(await import("~/lib/utils"));

const baseArgs = {
  workspaceRootDir: "/workspace",
  targetPackageDir: "/workspace/packages/consumer",
  internalDepPackageNames: [],
  packagesRegistry: {},
  includeDevDependencies: false,
};

describe("collectInstalledNamesFromBunLockfile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns an empty set when bun.lock is missing", () => {
    fs.existsSync.mockReturnValue(false);

    const result = collectInstalledNamesFromBunLockfile({
      ...baseArgs,
    });

    expect(result).toEqual(new Set());
  });

  it("walks external-to-external transitives from the target workspace entry", () => {
    fs.existsSync.mockReturnValue(true);
    readTypedJsonSync.mockReturnValue({
      lockfileVersion: 1,
      workspaces: {
        "packages/consumer": {
          name: "consumer",
          dependencies: { "@react-pdf/renderer": "^4.0.0" },
        },
      },
      packages: {
        "@react-pdf/renderer": [
          "@react-pdf/renderer@4.0.0",
          "https://registry/...",
          { dependencies: { "@react-pdf/render": "4.3.0" } },
          "checksum",
        ],
        "@react-pdf/render": [
          "@react-pdf/render@4.3.0",
          "https://registry/...",
          {},
          "checksum",
        ],
      },
    });

    const result = collectInstalledNamesFromBunLockfile({
      ...baseArgs,
    });

    expect(result.has("@react-pdf/renderer")).toBe(true);
    expect(result.has("@react-pdf/render")).toBe(true);
  });

  it("walks transitives reachable through internal workspace entries", () => {
    fs.existsSync.mockReturnValue(true);
    readTypedJsonSync.mockReturnValue({
      lockfileVersion: 1,
      workspaces: {
        "packages/consumer": {
          name: "consumer",
          dependencies: { "firebase-package": "workspace:*" },
        },
        "packages/firebase-package": {
          name: "firebase-package",
          dependencies: { tslib: "^2.0.0" },
        },
      },
      packages: {
        tslib: ["tslib@2.0.0", "https://registry/...", {}, "checksum"],
      },
    });

    const result = collectInstalledNamesFromBunLockfile({
      ...baseArgs,
      internalDepPackageNames: ["firebase-package"],
      packagesRegistry: {
        "firebase-package": {
          absoluteDir: "/workspace/packages/firebase-package",
          rootRelativeDir: "packages/firebase-package",
          manifest: { name: "firebase-package", version: "1.0.0" },
        },
      },
    });

    expect(result.has("tslib")).toBe(true);
  });

  it("skips devDependencies of the target when includeDevDependencies is false", () => {
    fs.existsSync.mockReturnValue(true);
    readTypedJsonSync.mockReturnValue({
      lockfileVersion: 1,
      workspaces: {
        "packages/consumer": {
          name: "consumer",
          dependencies: { lodash: "^4.0.0" },
          devDependencies: { typescript: "^5.0.0" },
        },
      },
      packages: {
        lodash: ["lodash@4.17.21", "https://registry/...", {}, "checksum"],
        typescript: [
          "typescript@5.5.0",
          "https://registry/...",
          {},
          "checksum",
        ],
      },
    });

    const result = collectInstalledNamesFromBunLockfile({
      ...baseArgs,
    });

    expect(result.has("lodash")).toBe(true);
    expect(result.has("typescript")).toBe(false);
  });

  it("returns an empty set when the lockfile read throws", () => {
    fs.existsSync.mockReturnValue(true);
    readTypedJsonSync.mockImplementation(() => {
      throw new Error("invalid json");
    });

    const result = collectInstalledNamesFromBunLockfile({
      ...baseArgs,
    });

    expect(result).toEqual(new Set());
  });
});
