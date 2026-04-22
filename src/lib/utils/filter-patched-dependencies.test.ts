import { describe, expect, it } from "vitest";
import type { PackageManifest } from "~/lib/types";
import { filterPatchedDependencies } from "./filter-patched-dependencies";

describe("filterPatchedDependencies", () => {
  it("should return undefined when patchedDependencies is undefined", () => {
    const manifest: PackageManifest = { name: "test", version: "1.0.0" };

    const result = filterPatchedDependencies({
      patchedDependencies: undefined,
      targetPackageManifest: manifest,
      includeDevDependencies: false,
    });

    expect(result).toBeUndefined();
  });

  it("should return undefined when patchedDependencies is empty", () => {
    const manifest: PackageManifest = {
      name: "test",
      version: "1.0.0",
      dependencies: { lodash: "^4.0.0" },
    };

    const result = filterPatchedDependencies({
      patchedDependencies: {},
      targetPackageManifest: manifest,
      includeDevDependencies: false,
    });

    expect(result).toBeUndefined();
  });

  it("should include patches for production dependencies", () => {
    const manifest: PackageManifest = {
      name: "test",
      version: "1.0.0",
      dependencies: { lodash: "^4.0.0" },
    };

    const result = filterPatchedDependencies({
      patchedDependencies: { "lodash@4.17.21": "patches/lodash.patch" },
      targetPackageManifest: manifest,
      includeDevDependencies: false,
    });

    expect(result).toEqual({ "lodash@4.17.21": "patches/lodash.patch" });
  });

  it("should include patches for dev dependencies when includeDevDependencies is true", () => {
    const manifest: PackageManifest = {
      name: "test",
      version: "1.0.0",
      devDependencies: { vitest: "^1.0.0" },
    };

    const result = filterPatchedDependencies({
      patchedDependencies: { "vitest@1.0.0": "patches/vitest.patch" },
      targetPackageManifest: manifest,
      includeDevDependencies: true,
    });

    expect(result).toEqual({ "vitest@1.0.0": "patches/vitest.patch" });
  });

  it("should exclude patches for dev dependencies when includeDevDependencies is false", () => {
    const manifest: PackageManifest = {
      name: "test",
      version: "1.0.0",
      devDependencies: { vitest: "^1.0.0" },
    };

    const result = filterPatchedDependencies({
      patchedDependencies: { "vitest@1.0.0": "patches/vitest.patch" },
      targetPackageManifest: manifest,
      includeDevDependencies: false,
    });

    expect(result).toBeUndefined();
  });

  it("should exclude patches for packages not in target dependencies", () => {
    const manifest: PackageManifest = {
      name: "test",
      version: "1.0.0",
      dependencies: { lodash: "^4.0.0" },
    };

    const result = filterPatchedDependencies({
      patchedDependencies: { "other-package@1.0.0": "patches/other.patch" },
      targetPackageManifest: manifest,
      includeDevDependencies: false,
    });

    expect(result).toBeUndefined();
  });

  it("should handle scoped package names correctly", () => {
    const manifest: PackageManifest = {
      name: "test",
      version: "1.0.0",
      dependencies: { "@firebase/app": "^1.0.0" },
    };

    const result = filterPatchedDependencies({
      patchedDependencies: {
        "@firebase/app@1.2.3": "patches/firebase-app.patch",
      },
      targetPackageManifest: manifest,
      includeDevDependencies: false,
    });

    expect(result).toEqual({
      "@firebase/app@1.2.3": "patches/firebase-app.patch",
    });
  });

  it("should filter mixed patches correctly", () => {
    const manifest: PackageManifest = {
      name: "test",
      version: "1.0.0",
      dependencies: { lodash: "^4.0.0", "@firebase/app": "^1.0.0" },
      devDependencies: { vitest: "^1.0.0" },
    };

    const result = filterPatchedDependencies({
      patchedDependencies: {
        "lodash@4.17.21": "patches/lodash.patch",
        "@firebase/app@1.2.3": "patches/firebase-app.patch",
        "vitest@1.0.0": "patches/vitest.patch",
        "unknown@1.0.0": "patches/unknown.patch",
      },
      targetPackageManifest: manifest,
      includeDevDependencies: false,
    });

    expect(result).toEqual({
      "lodash@4.17.21": "patches/lodash.patch",
      "@firebase/app@1.2.3": "patches/firebase-app.patch",
    });
  });

  it("should include dev dependency patches when includeDevDependencies is true in mixed scenario", () => {
    const manifest: PackageManifest = {
      name: "test",
      version: "1.0.0",
      dependencies: { lodash: "^4.0.0" },
      devDependencies: { vitest: "^1.0.0" },
    };

    const result = filterPatchedDependencies({
      patchedDependencies: {
        "lodash@4.17.21": "patches/lodash.patch",
        "vitest@1.0.0": "patches/vitest.patch",
      },
      targetPackageManifest: manifest,
      includeDevDependencies: true,
    });

    expect(result).toEqual({
      "lodash@4.17.21": "patches/lodash.patch",
      "vitest@1.0.0": "patches/vitest.patch",
    });
  });

  it("should return undefined when all patches are filtered out", () => {
    const manifest: PackageManifest = {
      name: "test",
      version: "1.0.0",
      dependencies: { lodash: "^4.0.0" },
    };

    const result = filterPatchedDependencies({
      patchedDependencies: {
        "unknown-a@1.0.0": "patches/a.patch",
        "unknown-b@2.0.0": "patches/b.patch",
      },
      targetPackageManifest: manifest,
      includeDevDependencies: false,
    });

    expect(result).toBeUndefined();
  });

  it("should include patches for packages reachable via internal workspace packages", () => {
    /** Issue #167: patch targets a transitive dep via an internal package */
    const manifest: PackageManifest = {
      name: "consumer",
      version: "1.0.0",
      dependencies: { "firebase-package": "file:./packages/firebase-package" },
    };

    const result = filterPatchedDependencies({
      patchedDependencies: { "tslib@2.0.0": "patches/tslib.patch" },
      targetPackageManifest: manifest,
      includeDevDependencies: false,
      reachableDependencyNames: new Set(["firebase-package", "tslib"]),
    });

    expect(result).toEqual({ "tslib@2.0.0": "patches/tslib.patch" });
  });

  it("should exclude patches for packages not in direct deps nor the reachable set", () => {
    const manifest: PackageManifest = {
      name: "consumer",
      version: "1.0.0",
      dependencies: { "firebase-package": "file:./packages/firebase-package" },
    };

    const result = filterPatchedDependencies({
      patchedDependencies: { "unrelated@1.0.0": "patches/unrelated.patch" },
      targetPackageManifest: manifest,
      includeDevDependencies: false,
      reachableDependencyNames: new Set(["firebase-package", "tslib"]),
    });

    expect(result).toBeUndefined();
  });

  it("should include a patch when a target devDep is also reachable as a prod transitive", () => {
    /**
     * The target lists `tslib` as a devDep and runs with
     * includeDevDependencies=false, but `tslib` is also a prod dep of an
     * internal workspace package that IS installed in the isolate. The
     * patch must be preserved because tslib will be present at install
     * time through the internal package.
     */
    const manifest: PackageManifest = {
      name: "app",
      version: "1.0.0",
      dependencies: { "firebase-package": "file:./packages/firebase-package" },
      devDependencies: { tslib: "^2.0.0" },
    };

    const result = filterPatchedDependencies({
      patchedDependencies: { "tslib@2.0.0": "patches/tslib.patch" },
      targetPackageManifest: manifest,
      includeDevDependencies: false,
      reachableDependencyNames: new Set(["firebase-package", "tslib"]),
    });

    expect(result).toEqual({ "tslib@2.0.0": "patches/tslib.patch" });
  });

  it("should still exclude a pure target devDep patch when not reachable and dev deps are off", () => {
    const manifest: PackageManifest = {
      name: "app",
      version: "1.0.0",
      devDependencies: { vitest: "^1.0.0" },
    };

    const result = filterPatchedDependencies({
      patchedDependencies: { "vitest@1.0.0": "patches/vitest.patch" },
      targetPackageManifest: manifest,
      includeDevDependencies: false,
      reachableDependencyNames: new Set(),
    });

    expect(result).toBeUndefined();
  });

  it("should preserve patch value types", () => {
    const manifest: PackageManifest = {
      name: "test",
      version: "1.0.0",
      dependencies: { lodash: "^4.0.0" },
    };

    const result = filterPatchedDependencies({
      patchedDependencies: {
        "lodash@4.17.21": { path: "patches/lodash.patch", hash: "abc123" },
      },
      targetPackageManifest: manifest,
      includeDevDependencies: false,
    });

    expect(result).toEqual({
      "lodash@4.17.21": { path: "patches/lodash.patch", hash: "abc123" },
    });
  });
});
