import fs from "fs-extra";
import { exec } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { type Document, isMap, isScalar, parseAllDocuments } from "yaml";
import { useLogger } from "#/lib/logger";
import {
  getErrorMessage,
  getPnpmLockfileDir,
  isRushWorkspace,
} from "#/lib/utils";

const LOCKFILE_NAME = "pnpm-lock.yaml";
const WORKSPACE_CONFIG_NAME = "pnpm-workspace.yaml";

/**
 * The newest lockfile major version the bundled `@pnpm/lockfile.fs` reader
 * understands. It reads a newer project document without complaint and then
 * fails deep inside pruning, so newer versions have to be caught up front.
 */
const MAX_READABLE_LOCKFILE_MAJOR_VERSION = 9;

export type ReadablePnpmLockfile = {
  /** The directory holding the `pnpm-lock.yaml` to read */
  dir: string;
  /**
   * Whether the workspace config asks for a lockfile format newer than v9.
   * pnpm then refuses a frozen install of a lockfile without its settings.
   */
  requestsNewerFormat: boolean;
};

/**
 * Call `useLockfile` with the workspace's own lockfile directory, unless the
 * lockfile declares a format newer than v9, such as the experimental v13 one
 * that pnpm 12.19 and later write with `lockfile.format: v13`. No published
 * library reads v13, so pnpm itself converts it to v9 in a staged copy of the
 * workspace, which is valid only until `useLockfile` settles and is removed
 * then. The workspace lockfile and config are never written to.
 */
export async function withReadablePnpmLockfileDir<T>(
  workspaceRootDir: string,
  useLockfile: (lockfile: ReadablePnpmLockfile) => Promise<T>,
): Promise<T> {
  const lockfileDir = getPnpmLockfileDir(workspaceRootDir);
  const lockfilePath = path.join(lockfileDir, LOCKFILE_NAME);
  const [projectDocument, requestedMajorVersion] = await Promise.all([
    readProjectDocument(lockfilePath),
    readRequestedLockfileMajorVersion(workspaceRootDir),
  ]);
  const requestsNewerFormat =
    requestedMajorVersion !== null &&
    requestedMajorVersion > MAX_READABLE_LOCKFILE_MAJOR_VERSION;
  const lockfileMajorVersion = readMajorVersion(projectDocument);

  if (
    !projectDocument ||
    lockfileMajorVersion === null ||
    lockfileMajorVersion <= MAX_READABLE_LOCKFILE_MAJOR_VERSION
  ) {
    return useLockfile({ dir: lockfileDir, requestsNewerFormat });
  }

  /**
   * Rush keeps the lockfile outside the workspace root, so its importer ids
   * would not survive staging the lockfile at the root of a copy.
   */
  if (isRushWorkspace(workspaceRootDir)) {
    throw new Error(
      `The pnpm lockfile at ${lockfilePath} uses lockfile format v${lockfileMajorVersion}, which isolate-package does not support in a Rush workspace`,
    );
  }

  const log = useLogger();

  log.debug(
    `Converting the v${lockfileMajorVersion} pnpm lockfile to v9 in a temporary copy`,
  );

  const stagingDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "isolate-pnpm-lockfile-"),
  );

  try {
    await stageWorkspace({
      workspaceRootDir,
      stagingDir,
      projectDirs: readProjectDirs(projectDocument),
    });
    await convertLockfile(stagingDir, lockfilePath);

    return await useLockfile({ dir: stagingDir, requestsNewerFormat });
  } finally {
    await fs.remove(stagingDir);
  }
}

/**
 * The project document, which pnpm 12 writes last, after an optional env
 * document that keeps version 9.0 even in a v13 lockfile. Resolves to null
 * when the file cannot be read or its last document does not parse, leaving
 * the readers to report that as they already do.
 */
async function readProjectDocument(lockfilePath: string) {
  let content: string;

  try {
    content = await fs.readFile(lockfilePath, "utf8");
  } catch {
    return null;
  }

  const projectDocument = parseAllDocuments(content).at(-1);

  return projectDocument && projectDocument.errors.length === 0
    ? projectDocument
    : null;
}

function readMajorVersion(projectDocument: Document | null) {
  const lockfileVersion: unknown = projectDocument?.get("lockfileVersion");
  const majorVersion = Number.parseInt(String(lockfileVersion), 10);

  return Number.isNaN(majorVersion) ? null : majorVersion;
}

/**
 * The root-relative directories of the projects the lockfile locks, keyed
 * `projects` in v13 and `importers` before it. Null when neither is there.
 */
function readProjectDirs(projectDocument: Document) {
  const projects: unknown =
    projectDocument.get("projects") ?? projectDocument.get("importers");

  if (!isMap(projects)) {
    return null;
  }

  return projects.items.map((item) =>
    String(isScalar(item.key) ? item.key.value : item.key),
  );
}

/**
 * The major version of the `lockfile.format` the workspace config asks for,
 * such as 13 for `v13`. Null when the config sets none or cannot be read.
 */
async function readRequestedLockfileMajorVersion(workspaceRootDir: string) {
  try {
    const configDocument = await readWorkspaceConfig(workspaceRootDir);
    const format: unknown = configDocument.getIn(["lockfile", "format"]);
    const majorVersion = Number.parseInt(String(format).replace(/^v/, ""), 10);

    return Number.isNaN(majorVersion) ? null : majorVersion;
  } catch {
    return null;
  }
}

async function readWorkspaceConfig(workspaceRootDir: string) {
  const configPath = path.join(workspaceRootDir, WORKSPACE_CONFIG_NAME);
  const config = parseAllDocuments(
    (await fs.pathExists(configPath))
      ? await fs.readFile(configPath, "utf8")
      : "{}",
  );
  const configDocument = config.at(0);

  if (!configDocument || config.length > 1) {
    throw new Error(`Expected a single YAML document in ${configPath}`);
  }

  const [configError] = configDocument.errors;

  if (configError) {
    throw configError;
  }

  return configDocument;
}

/**
 * Mirror the workspace root in `stagingDir` through symlinks, so pnpm sees the
 * same projects, manifests and settings under the same relative paths. The
 * root files pnpm might write are copied instead, so a write lands in the
 * staging directory: the lockfile, the root manifest, and the workspace config,
 * rewritten to ask for v9. The root `node_modules` is left out.
 *
 * The staged config lists exactly the lockfile's projects in place of the
 * workspace's `packages` globs. A recursive glob would otherwise also match
 * isolate output inside a package, from this run or an earlier one, as a
 * project the lockfile does not know, and the frozen install would refuse it.
 */
async function stageWorkspace({
  workspaceRootDir,
  stagingDir,
  projectDirs,
}: {
  workspaceRootDir: string;
  stagingDir: string;
  projectDirs: string[] | null;
}) {
  const configDocument = await readWorkspaceConfig(workspaceRootDir);

  configDocument.setIn(["lockfile", "format"], "v9");

  if (projectDirs) {
    configDocument.set(
      "packages",
      projectDirs.filter((projectDir) => projectDir !== "."),
    );
  }

  const skippedNames = new Set([
    ".git",
    "node_modules",
    LOCKFILE_NAME,
    WORKSPACE_CONFIG_NAME,
  ]);

  for (const name of await fs.readdir(workspaceRootDir)) {
    if (skippedNames.has(name)) continue;

    const source = path.join(workspaceRootDir, name);
    const destination = path.join(stagingDir, name);
    const stat = await fs.stat(source).catch(() => null);

    if (!stat) continue;

    if (stat.isDirectory()) {
      /** A junction needs no elevated rights on Windows; elsewhere it is ignored. */
      await fs.symlink(source, destination, "junction");
    } else if (name === "package.json" || process.platform === "win32") {
      /** File symlinks need elevated rights on Windows */
      await fs.copyFile(source, destination);
    } else {
      await fs.symlink(source, destination, "file");
    }
  }

  await Promise.all([
    fs.copyFile(
      path.join(workspaceRootDir, LOCKFILE_NAME),
      path.join(stagingDir, LOCKFILE_NAME),
    ),
    fs.writeFile(
      path.join(stagingDir, WORKSPACE_CONFIG_NAME),
      configDocument.toString(),
    ),
  ]);
}

/**
 * Have pnpm rewrite the staged lockfile as v9. `--frozen-lockfile` keeps the
 * locked resolutions exactly as they are and fails, rather than re-resolving,
 * when the lockfile is out of date with the manifests.
 */
async function convertLockfile(stagingDir: string, sourceLockfilePath: string) {
  try {
    await new Promise<void>((resolve, reject) => {
      exec(
        "pnpm install --lockfile-only --frozen-lockfile --ignore-scripts",
        { cwd: stagingDir, maxBuffer: 10 * 1024 * 1024 },
        (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        },
      );
    });
  } catch (error) {
    throw new Error(
      `Failed to convert the pnpm lockfile at ${sourceLockfilePath} to v9. This needs pnpm 12.19 or later, and a lockfile that is up to date with the workspace manifests: ${getErrorMessage(error)}`,
      { cause: error },
    );
  }

  const convertedMajorVersion = readMajorVersion(
    await readProjectDocument(path.join(stagingDir, LOCKFILE_NAME)),
  );

  if (convertedMajorVersion !== MAX_READABLE_LOCKFILE_MAJOR_VERSION) {
    throw new Error(
      `Failed to convert the pnpm lockfile at ${sourceLockfilePath} to v9: pnpm wrote lockfile version ${convertedMajorVersion ?? "unknown"}`,
    );
  }
}
