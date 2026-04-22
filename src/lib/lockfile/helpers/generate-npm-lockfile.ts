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
  /** Legacy v2 nested-tree representation; dropped when emitting the isolate lockfile. */
  dependencies?: unknown;
  /** Allow unknown top-level fields to flow through. */
  [key: string]: unknown;
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
  const targetImporterNode = workspaceNodes[0];

  if (!targetImporterNode) {
    throw new Error(
      `Target workspace "${targetPackageName}" not found in root package-lock.json`,
    );
  }

  if (typeof targetImporterNode.location !== "string") {
    throw new Error(
      `Target workspace "${targetPackageName}" resolved to a node without a location`,
    );
  }

  /**
   * `workspaceDependencySet` walks `edgesOut` from each seed node. It does
   * not add the seed node itself to the result, so ensure the target
   * importer is included.
   */
  const reachableNodes = arborist.workspaceDependencySet(
    rootTree,
    [targetPackageName],
    false,
  );
  reachableNodes.add(targetImporterNode);

  const srcData = rootTree.meta?.data as NpmLockfile | undefined;
  if (
    !srcData ||
    !srcData.packages ||
    Object.keys(srcData.packages).length === 0
  ) {
    /**
     * Arborist normalises v1 lockfiles to v3 in `loadVirtual`, but fall
     * back defensively if the virtual tree still has no `packages` map
     * (e.g. an unusual lockfile shape). The fallback generator reads
     * node_modules and won't preserve original versions, but it will
     * produce a valid lockfile rather than failing.
     */
    useLogger().debug(
      "Source lockfile has no `packages` map; falling back to buildIdealTree",
    );
    await generateViaBuildIdealTree({ workspaceRootDir, isolateDir });
    return;
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
    targetImporterLoc: targetImporterNode.location,
    /**
     * npm's lockfile exposes each workspace as a Link at
     * `node_modules/<name>`. This link is pointless in the isolate (the
     * target becomes the root), so filter it out if it shows up in the
     * reachable set.
     */
    targetLinkLoc: `node_modules/${targetPackageName}`,
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

  if (!srcPackages[targetImporterLoc]) {
    throw new Error(
      `Source lockfile has no entry for target importer "${targetImporterLoc}"`,
    );
  }

  const targetNestedNodeModulesPrefix = `${targetImporterLoc}/node_modules/`;

  /** Track the source location each output entry came from, so we can
   * produce a clear error if two source paths remap to the same target.
   */
  const origLocByNewLoc = new Map<string, string>();

  for (const node of reachable) {
    const origLoc = node.location;

    /** The target's self-link has no place in the isolate (root IS the target). */
    if (origLoc === targetLinkLoc) continue;

    /**
     * The target workspace becomes the isolate root, so:
     *   "packages/app"                         -> ""
     *   "packages/app/node_modules/<name>"     -> "node_modules/<name>"
     *   "packages/app/node_modules/a/node_modules/b" -> "node_modules/a/node_modules/b"
     *
     * Only `node_modules` subpaths under the target are remapped — other
     * paths (e.g. a nested workspace importer like
     * `packages/app/lib/core`) are preserved verbatim because their disk
     * location in the isolate is unchanged.
     */
    let newLoc: string;
    if (origLoc === targetImporterLoc) {
      newLoc = "";
    } else if (origLoc.startsWith(targetNestedNodeModulesPrefix)) {
      newLoc = origLoc.slice(targetImporterLoc.length + 1);
    } else {
      newLoc = origLoc;
    }

    const srcEntry = srcPackages[origLoc];
    if (!srcEntry) {
      throw new Error(
        `Reachable node "${origLoc}" has no entry in source lockfile packages`,
      );
    }

    const existing = outPackages[newLoc];
    if (existing && !entriesAreEquivalent(existing, srcEntry)) {
      const previousOrigLoc = origLocByNewLoc.get(newLoc) ?? "<unknown>";
      throw new Error(
        `Path collision at "${newLoc}": source locations "${previousOrigLoc}" and "${origLoc}" both map there with conflicting entries. ` +
          `This happens when the target pins a nested version override that collides with a hoisted version still needed by another reachable dependency. ` +
          `Please report a reproduction at https://github.com/0x80/isolate-package/issues.`,
      );
    }

    outPackages[newLoc] = { ...srcEntry };
    origLocByNewLoc.set(newLoc, origLoc);
  }

  /**
   * If the target importer didn't make it into the reachable set for any
   * reason (upstream Arborist bug, programmer error), bail loudly rather
   * than emit a synthesised root entry with no source metadata.
   */
  if (!outPackages[""]) {
    throw new Error(
      `Target importer "${targetImporterLoc}" was not present in the reachable node set; cannot construct isolate root entry`,
    );
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

  /**
   * Spread unknown top-level fields from the source lockfile so future
   * npm-introduced metadata survives isolation. Then override identity
   * fields and the recomputed `packages`, and drop the legacy
   * `dependencies` tree which would be stale now that `packages` has
   * been subsetted.
   */
  const out: NpmLockfile = {
    ...srcData,
    name: targetPackageManifest.name,
    version: targetPackageManifest.version,
    lockfileVersion: srcData.lockfileVersion ?? 3,
    packages: outPackages,
  };
  /**
   * `requires` is propagated via the `...srcData` spread when the source
   * has it. Don't invent one when the source omitted it — that would be
   * an unnecessary diff from the original lockfile shape.
   */
  if (srcData.requires === undefined) {
    delete out.requires;
  }
  delete out.dependencies;

  return out;
}

/**
 * Two source entries that map to the same output location are only
 * "equivalent" if they install identical content. We compare the fields
 * that actually determine what npm fetches and stores — version, resolved
 * URL, integrity, and the link flag for workspace links.
 */
function entriesAreEquivalent(
  a: LockfilePackageEntry,
  b: LockfilePackageEntry,
): boolean {
  return (
    a.version === b.version &&
    a.resolved === b.resolved &&
    a.integrity === b.integrity &&
    !!a.link === !!b.link
  );
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
