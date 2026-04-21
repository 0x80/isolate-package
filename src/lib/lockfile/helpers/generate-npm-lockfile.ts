import Arborist from "@npmcli/arborist";
import fs from "fs-extra";
import path from "node:path";
import { useLogger } from "~/lib/logger";
import type { PackageManifest, PackagesRegistry } from "~/lib/types";
import { getErrorMessage } from "~/lib/utils";
import { loadNpmConfig } from "./load-npm-config";

/**
 * Subset of a package-lock.json v2/v3 `packages[location]` entry that we
 * care about when rewriting. Arborist / npm preserve any additional fields
 * we don't enumerate here via object spread.
 */
type LockfilePackageEntry = {
  name?: string;
  version?: string;
  resolved?: string;
  integrity?: string;
  link?: boolean;
  dev?: boolean;
  optional?: boolean;
  peer?: boolean;
  devOptional?: boolean;
  extraneous?: boolean;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  peerDependenciesMeta?: Record<string, unknown>;
  bundleDependencies?: string[] | boolean;
  workspaces?: string[] | Record<string, unknown>;
  engines?: Record<string, string>;
  os?: string[];
  cpu?: string[];
  libc?: string[];
  bin?: Record<string, string> | string;
  funding?: unknown;
  license?: string;
  hasInstallScript?: boolean;
  inBundle?: boolean;
  deprecated?: string;
};

type NpmLockfile = {
  name?: string;
  version?: string;
  lockfileVersion: number;
  requires?: boolean;
  packages: Record<string, LockfilePackageEntry>;
  overrides?: Record<string, unknown>;
};

/**
 * Minimal node shape we consume from Arborist. Kept narrow so the pure JSON
 * rewriter can be tested without instantiating a real tree.
 */
export type ReachableNode = {
  location: string;
  isLink: boolean;
  target?: { location: string };
};

/**
 * Generate an isolated NPM lockfile for the target package.
 *
 * When a root `package-lock.json` exists we preserve original resolved
 * versions and integrity by copying entries verbatim from the source
 * lockfile. When it doesn't (forceNpm from pnpm/bun/yarn or modern-Yarn
 * fallback), we fall back to Arborist's `buildIdealTree` against the
 * isolate directory, which matches the prior behaviour.
 */
export async function generateNpmLockfile({
  workspaceRootDir,
  isolateDir,
  targetPackageName,
  targetPackageManifest,
  packagesRegistry,
  internalDepPackageNames,
}: {
  workspaceRootDir: string;
  isolateDir: string;
  targetPackageName: string;
  targetPackageManifest: PackageManifest;
  packagesRegistry: PackagesRegistry;
  internalDepPackageNames: string[];
}) {
  const log = useLogger();

  try {
    const rootLockfilePath = path.join(workspaceRootDir, "package-lock.json");

    if (fs.existsSync(rootLockfilePath)) {
      log.debug("Generating NPM lockfile from root package-lock.json...");
      await generateFromRootLockfile({
        workspaceRootDir,
        isolateDir,
        targetPackageName,
        targetPackageManifest,
        packagesRegistry,
        internalDepPackageNames,
      });
    } else {
      log.debug(
        "No root package-lock.json found; falling back to buildIdealTree generation",
      );
      await generateViaBuildIdealTree({ workspaceRootDir, isolateDir });
    }

    log.debug(
      "Created lockfile at",
      path.join(isolateDir, "package-lock.json"),
    );
  } catch (err) {
    log.error(`Failed to generate lockfile: ${getErrorMessage(err)}`);
    throw err;
  }
}

async function generateFromRootLockfile({
  workspaceRootDir,
  isolateDir,
  targetPackageName,
  targetPackageManifest,
  packagesRegistry,
  internalDepPackageNames,
}: {
  workspaceRootDir: string;
  isolateDir: string;
  targetPackageName: string;
  targetPackageManifest: PackageManifest;
  packagesRegistry: PackagesRegistry;
  internalDepPackageNames: string[];
}) {
  const log = useLogger();

  const config = await loadNpmConfig({ npmPath: workspaceRootDir });

  const arborist = new Arborist({
    path: workspaceRootDir,
    ...config.flat,
  });

  /**
   * `loadVirtual` hydrates every Node with `resolved` and `integrity` taken
   * directly from the lockfile entries. It performs no registry calls.
   */
  const rootTree = await arborist.loadVirtual();

  const workspaceNodes = arborist.workspaceNodes(rootTree, [targetPackageName]);
  const targetLink = workspaceNodes[0];

  if (!targetLink) {
    throw new Error(
      `Target workspace "${targetPackageName}" not found in root package-lock.json`,
    );
  }

  /**
   * `workspaceDependencySet` seeds with the workspace Link nodes and walks
   * `edgesOut`, adding Link targets along the way. It does not add the
   * target workspace's own importer Node, so we add it explicitly below.
   */
  const reachableNodes = arborist.workspaceDependencySet(
    rootTree,
    [targetPackageName],
    false,
  );
  reachableNodes.add(targetLink.target);

  const srcData = rootTree.meta?.data as NpmLockfile | undefined;
  if (!srcData || !srcData.packages) {
    throw new Error(
      "Failed to load source lockfile data from Arborist virtual tree",
    );
  }

  const reachable: ReachableNode[] = [...reachableNodes].map((node) => ({
    location: node.location,
    isLink: node.isLink,
    target: node.target ? { location: node.target.location } : undefined,
  }));

  const internalDepLocs = new Map<string, string>();
  for (const depName of internalDepPackageNames) {
    const pkg = packagesRegistry[depName];
    if (!pkg) {
      throw new Error(`Package ${depName} not found in packages registry`);
    }
    internalDepLocs.set(depName, toPosix(pkg.rootRelativeDir));
  }

  const out = buildIsolatedLockfileJson({
    srcData,
    reachable,
    targetImporterLoc: targetLink.target.location,
    targetLinkLoc: targetLink.location,
    targetPackageManifest,
  });

  /**
   * Overlay each internal dep's adapted manifest onto its lockfile entry
   * so cross-internal-dep references use `file:` instead of `workspace:*`.
   */
  for (const [, depLoc] of internalDepLocs) {
    if (!out.packages[depLoc]) continue;
    const adaptedManifestPath = path.join(isolateDir, depLoc, "package.json");
    if (!fs.existsSync(adaptedManifestPath)) {
      log.debug(
        `Adapted internal dep manifest missing at ${adaptedManifestPath}; leaving lockfile entry unchanged`,
      );
      continue;
    }
    const adapted = (await fs.readJson(adaptedManifestPath)) as PackageManifest;
    overlayManifestDeps(out.packages[depLoc], adapted);
  }

  const outPath = path.join(isolateDir, "package-lock.json");
  await fs.writeFile(outPath, JSON.stringify(out, null, 2) + "\n");
}

/**
 * Pure JSON rewrite of the source lockfile into an isolated lockfile.
 * Extracted so it can be unit tested without mocking Arborist.
 */
export function buildIsolatedLockfileJson({
  srcData,
  reachable,
  targetImporterLoc,
  targetLinkLoc,
  targetPackageManifest,
}: {
  srcData: NpmLockfile;
  reachable: ReachableNode[];
  /** Source location of the target workspace's real importer (e.g. "packages/app") */
  targetImporterLoc: string;
  /** Source location of the target workspace's Link (e.g. "node_modules/app") */
  targetLinkLoc: string;
  targetPackageManifest: PackageManifest;
}): NpmLockfile {
  const outPackages: Record<string, LockfilePackageEntry> = {};
  const srcPackages = srcData.packages;

  for (const node of reachable) {
    const origLoc = node.location;

    /** The target's self-link has no place in the isolate (root IS the target). */
    if (origLoc === targetLinkLoc) continue;

    const newLoc = origLoc === targetImporterLoc ? "" : origLoc;

    const srcEntry = srcPackages[origLoc];
    if (!srcEntry) continue;

    outPackages[newLoc] = { ...srcEntry };
  }

  /** Overlay the isolate root with the adapted target manifest. */
  const rootEntry: LockfilePackageEntry = { ...outPackages[""] };
  rootEntry.name = targetPackageManifest.name;
  if (targetPackageManifest.version) {
    rootEntry.version = targetPackageManifest.version;
  }
  overlayManifestDeps(rootEntry, targetPackageManifest);
  /** The isolate is no longer a workspace root. */
  delete rootEntry.workspaces;
  outPackages[""] = rootEntry;

  const out: NpmLockfile = {
    name: targetPackageManifest.name,
    version: targetPackageManifest.version,
    lockfileVersion: srcData.lockfileVersion ?? 3,
    requires: srcData.requires ?? true,
    packages: outPackages,
  };
  if (srcData.overrides) {
    out.overrides = srcData.overrides;
  }

  return out;
}

function overlayManifestDeps(
  entry: LockfilePackageEntry,
  manifest: PackageManifest,
) {
  const fields = [
    "dependencies",
    "devDependencies",
    "optionalDependencies",
    "peerDependencies",
  ] as const;
  for (const field of fields) {
    const value = manifest[field];
    if (value) {
      entry[field] = value;
    } else {
      delete entry[field];
    }
  }
}

function toPosix(p: string): string {
  return p.split(path.sep).join(path.posix.sep);
}

async function generateViaBuildIdealTree({
  workspaceRootDir,
  isolateDir,
}: {
  workspaceRootDir: string;
  isolateDir: string;
}) {
  const nodeModulesPath = path.join(workspaceRootDir, "node_modules");
  if (!fs.existsSync(nodeModulesPath)) {
    throw new Error(`Failed to find node_modules at ${nodeModulesPath}`);
  }

  const config = await loadNpmConfig({ npmPath: workspaceRootDir });

  const arborist = new Arborist({
    path: isolateDir,
    ...config.flat,
  });

  const { meta } = await arborist.buildIdealTree();
  meta?.commit();

  const lockfilePath = path.join(isolateDir, "package-lock.json");
  await fs.writeFile(lockfilePath, String(meta));
}
