import { describe, it, expect } from "vitest";
import {
  buildIsolatedLockfileJson,
  type ReachableNode,
} from "./generate-npm-lockfile";

/**
 * Builds a fixture lockfile representing a monorepo with:
 *   - root workspace at ""
 *   - target workspace "my-app" at "packages/my-app"
 *   - internal workspace "shared" at "packages/shared"
 *   - unrelated workspace "other" at "packages/other"
 *   - hoisted external deps express@4, lodash@4
 *   - transitive dep body-parser nested under express due to a version pin
 */
function createSrcLockfile() {
  return {
    name: "root",
    version: "0.0.0",
    lockfileVersion: 3,
    requires: true,
    packages: {
      "": {
        name: "root",
        version: "0.0.0",
        workspaces: ["packages/*"],
      },
      "packages/my-app": {
        name: "my-app",
        version: "1.0.0",
        dependencies: {
          shared: "*",
          express: "^4.0.0",
        },
        devDependencies: {
          lodash: "^4.17.0",
        },
      },
      "packages/shared": {
        name: "shared",
        version: "1.0.0",
        dependencies: {
          lodash: "^4.17.0",
        },
      },
      "packages/other": {
        name: "other",
        version: "1.0.0",
      },
      "node_modules/my-app": {
        resolved: "packages/my-app",
        link: true,
      },
      "node_modules/shared": {
        resolved: "packages/shared",
        link: true,
      },
      "node_modules/other": {
        resolved: "packages/other",
        link: true,
      },
      "node_modules/express": {
        version: "4.18.2",
        resolved: "https://registry.npmjs.org/express/-/express-4.18.2.tgz",
        integrity: "sha512-fake-express-integrity",
        dependencies: {
          "body-parser": "1.20.0",
        },
      },
      "node_modules/express/node_modules/body-parser": {
        version: "1.20.0",
        resolved:
          "https://registry.npmjs.org/body-parser/-/body-parser-1.20.0.tgz",
        integrity: "sha512-fake-body-parser-integrity",
      },
      "node_modules/lodash": {
        version: "4.17.21",
        resolved: "https://registry.npmjs.org/lodash/-/lodash-4.17.21.tgz",
        integrity: "sha512-fake-lodash-integrity",
        dev: true,
      },
    },
  };
}

/**
 * Builds the reachable node set that Arborist's workspaceDependencySet would
 * produce for the target "my-app", plus the explicit inclusion of the target's
 * real importer Node (which workspaceDependencySet omits).
 */
function createReachable(): ReachableNode[] {
  return [
    {
      location: "node_modules/my-app",
      isLink: true,
      target: { location: "packages/my-app" },
    },
    { location: "packages/my-app", isLink: false },
    {
      location: "node_modules/shared",
      isLink: true,
      target: { location: "packages/shared" },
    },
    { location: "packages/shared", isLink: false },
    { location: "node_modules/express", isLink: false },
    {
      location: "node_modules/express/node_modules/body-parser",
      isLink: false,
    },
    { location: "node_modules/lodash", isLink: false },
  ];
}

describe("buildIsolatedLockfileJson", () => {
  it("maps target workspace to root and drops target self-link", () => {
    const srcData = createSrcLockfile();
    const out = buildIsolatedLockfileJson({
      srcData,
      reachable: createReachable(),
      targetImporterLoc: "packages/my-app",
      targetLinkLoc: "node_modules/my-app",
      targetPackageManifest: {
        name: "my-app",
        version: "1.0.0",
        dependencies: {
          shared: "file:./packages/shared",
          express: "^4.0.0",
        },
      },
    });

    expect(out.packages[""]).toBeDefined();
    expect(out.packages[""]!.name).toBe("my-app");
    expect(out.packages[""]!.version).toBe("1.0.0");
    expect(out.packages["packages/my-app"]).toBeUndefined();
    expect(out.packages["node_modules/my-app"]).toBeUndefined();
  });

  it("preserves external package resolved/integrity verbatim", () => {
    const srcData = createSrcLockfile();
    const out = buildIsolatedLockfileJson({
      srcData,
      reachable: createReachable(),
      targetImporterLoc: "packages/my-app",
      targetLinkLoc: "node_modules/my-app",
      targetPackageManifest: { name: "my-app", version: "1.0.0" },
    });

    expect(out.packages["node_modules/express"]).toEqual(
      srcData.packages["node_modules/express"],
    );
    expect(out.packages["node_modules/lodash"]).toEqual(
      srcData.packages["node_modules/lodash"],
    );
  });

  it("preserves nested node_modules paths (hoisting duplicates)", () => {
    const srcData = createSrcLockfile();
    const out = buildIsolatedLockfileJson({
      srcData,
      reachable: createReachable(),
      targetImporterLoc: "packages/my-app",
      targetLinkLoc: "node_modules/my-app",
      targetPackageManifest: { name: "my-app", version: "1.0.0" },
    });

    expect(
      out.packages["node_modules/express/node_modules/body-parser"],
    ).toEqual(
      srcData.packages["node_modules/express/node_modules/body-parser"],
    );
  });

  it("excludes unrelated workspaces and their link entries", () => {
    const srcData = createSrcLockfile();
    const out = buildIsolatedLockfileJson({
      srcData,
      reachable: createReachable(),
      targetImporterLoc: "packages/my-app",
      targetLinkLoc: "node_modules/my-app",
      targetPackageManifest: { name: "my-app", version: "1.0.0" },
    });

    expect(out.packages["packages/other"]).toBeUndefined();
    expect(out.packages["node_modules/other"]).toBeUndefined();
  });

  it("preserves internal workspace link entries", () => {
    const srcData = createSrcLockfile();
    const out = buildIsolatedLockfileJson({
      srcData,
      reachable: createReachable(),
      targetImporterLoc: "packages/my-app",
      targetLinkLoc: "node_modules/my-app",
      targetPackageManifest: { name: "my-app", version: "1.0.0" },
    });

    expect(out.packages["node_modules/shared"]).toEqual({
      resolved: "packages/shared",
      link: true,
    });
    expect(out.packages["packages/shared"]).toBeDefined();
    expect(out.packages["packages/shared"]!.name).toBe("shared");
  });

  it("overlays root entry deps from the adapted target manifest", () => {
    const srcData = createSrcLockfile();
    const out = buildIsolatedLockfileJson({
      srcData,
      reachable: createReachable(),
      targetImporterLoc: "packages/my-app",
      targetLinkLoc: "node_modules/my-app",
      targetPackageManifest: {
        name: "my-app",
        version: "1.0.0",
        dependencies: {
          shared: "file:./packages/shared",
          express: "^4.0.0",
        },
        devDependencies: {
          lodash: "^4.17.0",
        },
      },
    });

    expect(out.packages[""]!.dependencies).toEqual({
      shared: "file:./packages/shared",
      express: "^4.0.0",
    });
    expect(out.packages[""]!.devDependencies).toEqual({
      lodash: "^4.17.0",
    });
  });

  it("strips workspaces field from root entry", () => {
    const srcData = createSrcLockfile();
    const out = buildIsolatedLockfileJson({
      srcData,
      reachable: createReachable(),
      targetImporterLoc: "packages/my-app",
      targetLinkLoc: "node_modules/my-app",
      targetPackageManifest: { name: "my-app", version: "1.0.0" },
    });

    expect(out.packages[""]!.workspaces).toBeUndefined();
  });

  it("preserves lockfileVersion and requires from source", () => {
    const srcData = createSrcLockfile();
    const out = buildIsolatedLockfileJson({
      srcData,
      reachable: createReachable(),
      targetImporterLoc: "packages/my-app",
      targetLinkLoc: "node_modules/my-app",
      targetPackageManifest: { name: "my-app", version: "1.0.0" },
    });

    expect(out.lockfileVersion).toBe(3);
    expect(out.requires).toBe(true);
  });

  it("sets top-level name and version from target manifest", () => {
    const srcData = createSrcLockfile();
    const out = buildIsolatedLockfileJson({
      srcData,
      reachable: createReachable(),
      targetImporterLoc: "packages/my-app",
      targetLinkLoc: "node_modules/my-app",
      targetPackageManifest: { name: "my-app", version: "2.3.4" },
    });

    expect(out.name).toBe("my-app");
    expect(out.version).toBe("2.3.4");
  });

  it("preserves overrides from source lockfile", () => {
    const srcData = {
      ...createSrcLockfile(),
      overrides: { lodash: "4.17.21" },
    };
    const out = buildIsolatedLockfileJson({
      srcData,
      reachable: createReachable(),
      targetImporterLoc: "packages/my-app",
      targetLinkLoc: "node_modules/my-app",
      targetPackageManifest: { name: "my-app", version: "1.0.0" },
    });

    expect(out.overrides).toEqual({ lodash: "4.17.21" });
  });

  it("omits overrides when source has none", () => {
    const srcData = createSrcLockfile();
    const out = buildIsolatedLockfileJson({
      srcData,
      reachable: createReachable(),
      targetImporterLoc: "packages/my-app",
      targetLinkLoc: "node_modules/my-app",
      targetPackageManifest: { name: "my-app", version: "1.0.0" },
    });

    expect(out.overrides).toBeUndefined();
  });

  it("removes dep fields from root entry when adapted manifest omits them", () => {
    const srcData = createSrcLockfile();
    const out = buildIsolatedLockfileJson({
      srcData,
      reachable: createReachable(),
      targetImporterLoc: "packages/my-app",
      targetLinkLoc: "node_modules/my-app",
      /** Adapted manifest with no deps */
      targetPackageManifest: { name: "my-app", version: "1.0.0" },
    });

    expect(out.packages[""]!.dependencies).toBeUndefined();
    expect(out.packages[""]!.devDependencies).toBeUndefined();
  });
});
