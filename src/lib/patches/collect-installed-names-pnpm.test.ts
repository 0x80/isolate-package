import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { collectInstalledNamesFromPnpmLockfile } from "./collect-installed-names-pnpm";

vi.mock("pnpm_lockfile_file_v8", () => ({
  readWantedLockfile: vi.fn(() => Promise.resolve(null)),
  getLockfileImporterId: vi.fn(
    (root: string, dir: string) => dir.replace(`${root}/`, "") || ".",
  ),
}));

vi.mock("pnpm_lockfile_file_v9", () => ({
  readWantedLockfile: vi.fn(() => Promise.resolve(null)),
  getLockfileImporterId: vi.fn(
    (root: string, dir: string) => dir.replace(`${root}/`, "") || ".",
  ),
}));

vi.mock("~/lib/utils", () => ({
  getPackageName: vi.fn((spec: string) => {
    if (spec.startsWith("@")) {
      const parts = spec.split("@");
      return `@${parts[1] ?? ""}`;
    }
    return spec.split("@")[0] ?? "";
  }),
  isRushWorkspace: vi.fn(() => false),
}));

const { readWantedLockfile: readWantedLockfile_v9 } = vi.mocked(
  await import("pnpm_lockfile_file_v9"),
);
const { readWantedLockfile: readWantedLockfile_v8 } = vi.mocked(
  await import("pnpm_lockfile_file_v8"),
);

const baseArgs = {
  workspaceRootDir: "/workspace",
  targetPackageDir: "/workspace/packages/consumer",
  internalDepPackageNames: [],
  packagesRegistry: {},
  includeDevDependencies: false,
};

describe("collectInstalledNamesFromPnpmLockfile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns an empty set when the lockfile is missing", async () => {
    readWantedLockfile_v9.mockResolvedValue(null);

    const result = await collectInstalledNamesFromPnpmLockfile({
      ...baseArgs,
      majorVersion: 9,
    });

    expect(result).toEqual(new Set());
  });

  it("walks external-to-external transitives from the target importer", async () => {
    readWantedLockfile_v9.mockResolvedValue({
      lockfileVersion: "9.0",
      importers: {
        "packages/consumer": {
          specifiers: { "@react-pdf/renderer": "^4.0.0" },
          dependencies: { "@react-pdf/renderer": "4.0.0" },
        },
      },
      packages: {
        "@react-pdf/renderer@4.0.0": {
          resolution: { integrity: "sha512-x" },
          dependencies: { "@react-pdf/render": "4.3.0" },
        },
        "@react-pdf/render@4.3.0": {
          resolution: { integrity: "sha512-y" },
        },
      },
    } as unknown as Awaited<ReturnType<typeof readWantedLockfile_v9>>);

    const result = await collectInstalledNamesFromPnpmLockfile({
      ...baseArgs,
      majorVersion: 9,
    });

    expect(result.has("@react-pdf/renderer")).toBe(true);
    expect(result.has("@react-pdf/render")).toBe(true);
  });

  it("walks transitives reachable through internal workspace importers", async () => {
    readWantedLockfile_v9.mockResolvedValue({
      lockfileVersion: "9.0",
      importers: {
        "packages/consumer": {
          specifiers: { "firebase-package": "workspace:*" },
          dependencies: { "firebase-package": "link:../firebase-package" },
        },
        "packages/firebase-package": {
          specifiers: { tslib: "^2.0.0" },
          dependencies: { tslib: "2.0.0" },
        },
      },
      packages: {
        "tslib@2.0.0": { resolution: { integrity: "sha512-z" } },
      },
    } as unknown as Awaited<ReturnType<typeof readWantedLockfile_v9>>);

    const result = await collectInstalledNamesFromPnpmLockfile({
      ...baseArgs,
      internalDepPackageNames: ["firebase-package"],
      packagesRegistry: {
        "firebase-package": {
          absoluteDir: "/workspace/packages/firebase-package",
          rootRelativeDir: "packages/firebase-package",
          manifest: { name: "firebase-package", version: "1.0.0" },
        },
      },
      majorVersion: 9,
    });

    expect(result.has("tslib")).toBe(true);
  });

  it("does not include the target's devDependencies when includeDevDependencies is false", async () => {
    readWantedLockfile_v9.mockResolvedValue({
      lockfileVersion: "9.0",
      importers: {
        "packages/consumer": {
          specifiers: { lodash: "^4.0.0", typescript: "^5.0.0" },
          dependencies: { lodash: "4.17.21" },
          devDependencies: { typescript: "5.5.0" },
        },
      },
      packages: {
        "lodash@4.17.21": { resolution: { integrity: "sha512-a" } },
        "typescript@5.5.0": { resolution: { integrity: "sha512-b" } },
      },
    } as unknown as Awaited<ReturnType<typeof readWantedLockfile_v9>>);

    const result = await collectInstalledNamesFromPnpmLockfile({
      ...baseArgs,
      majorVersion: 9,
    });

    expect(result.has("lodash")).toBe(true);
    expect(result.has("typescript")).toBe(false);
  });

  it("includes the target's devDependencies when includeDevDependencies is true", async () => {
    readWantedLockfile_v9.mockResolvedValue({
      lockfileVersion: "9.0",
      importers: {
        "packages/consumer": {
          specifiers: { typescript: "^5.0.0" },
          devDependencies: { typescript: "5.5.0" },
        },
      },
      packages: {
        "typescript@5.5.0": { resolution: { integrity: "sha512-b" } },
      },
    } as unknown as Awaited<ReturnType<typeof readWantedLockfile_v9>>);

    const result = await collectInstalledNamesFromPnpmLockfile({
      ...baseArgs,
      majorVersion: 9,
      includeDevDependencies: true,
    });

    expect(result.has("typescript")).toBe(true);
  });

  it("uses the v8 reader for pnpm major < 9", async () => {
    readWantedLockfile_v8.mockResolvedValue({
      lockfileVersion: 6.1,
      importers: {
        "packages/consumer": {
          specifiers: { foo: "^1.0.0" },
          dependencies: { foo: "1.0.0" },
        },
      },
      packages: {
        "/foo@1.0.0": { resolution: { integrity: "sha512-c" } },
      },
    } as unknown as Awaited<ReturnType<typeof readWantedLockfile_v8>>);

    const result = await collectInstalledNamesFromPnpmLockfile({
      ...baseArgs,
      majorVersion: 8,
    });

    /**
     * The v8 reader is used; we check it was invoked (the v9 mock is left at
     * default which would return null and produce an empty set).
     */
    expect(readWantedLockfile_v8).toHaveBeenCalled();
    expect(readWantedLockfile_v9).not.toHaveBeenCalled();
    expect(result.has("foo")).toBe(true);
  });

  it("strips peer-resolution suffixes when extracting package names", async () => {
    readWantedLockfile_v9.mockResolvedValue({
      lockfileVersion: "9.0",
      importers: {
        "packages/consumer": {
          specifiers: { "react-dom": "^18.0.0" },
          dependencies: {
            "react-dom": "18.2.0(react@18.2.0)",
          },
        },
      },
      packages: {
        "react-dom@18.2.0(react@18.2.0)": {
          resolution: { integrity: "sha512-d" },
          dependencies: { react: "18.2.0" },
        },
        "react@18.2.0": { resolution: { integrity: "sha512-e" } },
      },
    } as unknown as Awaited<ReturnType<typeof readWantedLockfile_v9>>);

    const result = await collectInstalledNamesFromPnpmLockfile({
      ...baseArgs,
      majorVersion: 9,
    });

    expect(result.has("react-dom")).toBe(true);
    expect(result.has("react")).toBe(true);
  });

  it("returns an empty set when the lockfile read throws", async () => {
    readWantedLockfile_v9.mockRejectedValueOnce(new Error("boom"));

    const result = await collectInstalledNamesFromPnpmLockfile({
      ...baseArgs,
      majorVersion: 9,
    });

    expect(result).toEqual(new Set());
  });
});
