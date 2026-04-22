import { describe, expect, it } from "vitest";
import type { PackageManifest, PackagesRegistry } from "~/lib/types";
import { collectReachablePackageNames } from "./collect-reachable-package-names";

function entry(manifest: PackageManifest) {
  return {
    absoluteDir: `/workspace/packages/${manifest.name}`,
    rootRelativeDir: `packages/${manifest.name}`,
    manifest,
  };
}

describe("collectReachablePackageNames", () => {
  it("returns target direct deps", () => {
    const manifest: PackageManifest = {
      name: "app",
      version: "1.0.0",
      dependencies: { lodash: "^4.0.0", tslib: "^2.0.0" },
    };

    const result = collectReachablePackageNames({
      targetPackageManifest: manifest,
      packagesRegistry: {},
      includeDevDependencies: false,
    });

    expect([...result].sort()).toEqual(["lodash", "tslib"]);
  });

  it("excludes target devDependencies when includeDevDependencies is false", () => {
    const manifest: PackageManifest = {
      name: "app",
      version: "1.0.0",
      dependencies: { lodash: "^4.0.0" },
      devDependencies: { vitest: "^1.0.0" },
    };

    const result = collectReachablePackageNames({
      targetPackageManifest: manifest,
      packagesRegistry: {},
      includeDevDependencies: false,
    });

    expect(result.has("lodash")).toBe(true);
    expect(result.has("vitest")).toBe(false);
  });

  it("includes target devDependencies when includeDevDependencies is true", () => {
    const manifest: PackageManifest = {
      name: "app",
      version: "1.0.0",
      dependencies: { lodash: "^4.0.0" },
      devDependencies: { vitest: "^1.0.0" },
    };

    const result = collectReachablePackageNames({
      targetPackageManifest: manifest,
      packagesRegistry: {},
      includeDevDependencies: true,
    });

    expect([...result].sort()).toEqual(["lodash", "vitest"]);
  });

  it("recurses through internal workspace packages to pick up their deps", () => {
    /** Mirrors issue #167: consumer → firebase-package (internal) → tslib */
    const consumerManifest: PackageManifest = {
      name: "consumer",
      version: "1.0.0",
      dependencies: { "firebase-package": "workspace:*" },
    };
    const firebaseManifest: PackageManifest = {
      name: "firebase-package",
      version: "1.0.0",
      dependencies: { tslib: "^2.0.0" },
    };

    const registry: PackagesRegistry = {
      "firebase-package": entry(firebaseManifest),
    };

    const result = collectReachablePackageNames({
      targetPackageManifest: consumerManifest,
      packagesRegistry: registry,
      includeDevDependencies: false,
    });

    expect(result.has("firebase-package")).toBe(true);
    expect(result.has("tslib")).toBe(true);
  });

  it("does not include devDependencies of internal packages", () => {
    const consumerManifest: PackageManifest = {
      name: "consumer",
      version: "1.0.0",
      dependencies: { "firebase-package": "workspace:*" },
    };
    const firebaseManifest: PackageManifest = {
      name: "firebase-package",
      version: "1.0.0",
      dependencies: { tslib: "^2.0.0" },
      devDependencies: { vitest: "^1.0.0" },
    };

    const registry: PackagesRegistry = {
      "firebase-package": entry(firebaseManifest),
    };

    const result = collectReachablePackageNames({
      targetPackageManifest: consumerManifest,
      packagesRegistry: registry,
      /**
       * Even with includeDevDependencies true for the target, internal
       * packages' devDependencies stay out — they aren't installed in the
       * isolate.
       */
      includeDevDependencies: true,
    });

    expect(result.has("tslib")).toBe(true);
    expect(result.has("vitest")).toBe(false);
  });

  it("handles multi-level internal chains", () => {
    const appManifest: PackageManifest = {
      name: "app",
      version: "1.0.0",
      dependencies: { "pkg-a": "workspace:*" },
    };
    const pkgAManifest: PackageManifest = {
      name: "pkg-a",
      version: "1.0.0",
      dependencies: { "pkg-b": "workspace:*" },
    };
    const pkgBManifest: PackageManifest = {
      name: "pkg-b",
      version: "1.0.0",
      dependencies: { "@scope/leaf": "^1.0.0" },
    };

    const registry: PackagesRegistry = {
      "pkg-a": entry(pkgAManifest),
      "pkg-b": entry(pkgBManifest),
    };

    const result = collectReachablePackageNames({
      targetPackageManifest: appManifest,
      packagesRegistry: registry,
      includeDevDependencies: false,
    });

    expect([...result].sort()).toEqual(["@scope/leaf", "pkg-a", "pkg-b"]);
  });

  it("walks optionalDependencies of target and internal packages", () => {
    const appManifest: PackageManifest = {
      name: "app",
      version: "1.0.0",
      dependencies: { "pkg-a": "workspace:*" },
      optionalDependencies: { "optional-on-target": "^1.0.0" },
    };
    const pkgAManifest: PackageManifest = {
      name: "pkg-a",
      version: "1.0.0",
      optionalDependencies: { "optional-on-internal": "^1.0.0" },
    };

    const registry: PackagesRegistry = {
      "pkg-a": entry(pkgAManifest),
    };

    const result = collectReachablePackageNames({
      targetPackageManifest: appManifest,
      packagesRegistry: registry,
      includeDevDependencies: false,
    });

    expect(result.has("optional-on-target")).toBe(true);
    expect(result.has("optional-on-internal")).toBe(true);
  });

  it("walks peerDependencies of target and internal packages", () => {
    /**
     * With pnpm's default autoInstallPeers, peer deps typically end up
     * installed in the isolate and may carry patches.
     */
    const appManifest: PackageManifest = {
      name: "app",
      version: "1.0.0",
      dependencies: { "pkg-a": "workspace:*" },
      peerDependencies: { "peer-on-target": "^1.0.0" },
    };
    const pkgAManifest: PackageManifest = {
      name: "pkg-a",
      version: "1.0.0",
      peerDependencies: { "peer-on-internal": "^1.0.0" },
    };

    const registry: PackagesRegistry = {
      "pkg-a": entry(pkgAManifest),
    };

    const result = collectReachablePackageNames({
      targetPackageManifest: appManifest,
      packagesRegistry: registry,
      includeDevDependencies: false,
    });

    expect(result.has("peer-on-target")).toBe(true);
    expect(result.has("peer-on-internal")).toBe(true);
  });

  it("tolerates cycles between internal packages", () => {
    /** Each package already visited is skipped on re-entry */
    const aManifest: PackageManifest = {
      name: "pkg-a",
      version: "1.0.0",
      dependencies: { "pkg-b": "workspace:*", tslib: "^2.0.0" },
    };
    const bManifest: PackageManifest = {
      name: "pkg-b",
      version: "1.0.0",
      dependencies: { "pkg-a": "workspace:*" },
    };

    const registry: PackagesRegistry = {
      "pkg-a": entry(aManifest),
      "pkg-b": entry(bManifest),
    };

    const result = collectReachablePackageNames({
      targetPackageManifest: aManifest,
      packagesRegistry: registry,
      includeDevDependencies: false,
    });

    expect([...result].sort()).toEqual(["pkg-a", "pkg-b", "tslib"]);
  });
});
