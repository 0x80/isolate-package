import { randomBytes } from "node:crypto";
import fs from "fs-extra";
import path from "node:path";
import { useLogger } from "../logger";

/**
 * Prefix used for trash directories created when resetting the isolate output
 * directory. The leading dot keeps it hidden in file explorers and `ls`
 * without `-a`, so users don't see a flash of two folders while the old
 * contents are being reaped in the background.
 */
const TRASH_PREFIX = ".";
const TRASH_INFIX = ".trash-";

export type ResetIsolateDirOptions = {
  /**
   * Directory in which to place the temporary "trash" sibling that
   * `isolateDir` is renamed to before being deleted in the background.
   * Defaults to `path.dirname(isolateDir)`.
   *
   * Callers that pack the parent of `isolateDir` (e.g. `isolate.ts`, which
   * later runs `npm pack` on `targetPackageDir`) should point this at a
   * location outside of what gets packed, so the trash can't leak into the
   * packed output and so the background delete can't race with the pack
   * step.
   */
  trashParentDir?: string;
};

/**
 * Reset the isolate output directory to a fresh empty directory, avoiding the
 * `ENOTEMPTY` race that occurs when another process (e.g. the Firebase
 * functions emulator, a file watcher) writes into the directory while it is
 * being recursively deleted.
 *
 * Strategy:
 *
 * 1. Sweep any leftover trash directories from previous runs that may have
 *    been killed mid-cleanup. Best-effort: ignore errors.
 * 2. If the isolate directory exists, atomically `rename` it to a hidden
 *    sibling on the same filesystem. The rename is atomic, so the moment it
 *    returns the original path is free for a fresh empty directory and
 *    nothing a concurrent writer does inside the old tree can affect the
 *    new one.
 * 3. Kick off the recursive delete of the trash directory in the background.
 *    We don't await it: it is the slowest part of an isolate run, and any
 *    failure (e.g. another process still holding files open) is harmless
 *    because the logical state is already correct. Stale trash dirs are
 *    reaped by the next run's sweep in step 1.
 * 4. Ensure the (now-vacant) isolate directory exists.
 */
export async function resetIsolateDir(
  isolateDir: string,
  options: ResetIsolateDirOptions = {},
): Promise<void> {
  const log = useLogger();
  const trashParentDir = options.trashParentDir ?? path.dirname(isolateDir);
  const trashStem = buildTrashStem(trashParentDir, isolateDir);
  const trashGlobPrefix = `${TRASH_PREFIX}${trashStem}${TRASH_INFIX}`;

  /** Best-effort sweep of leftover trash from previously killed runs. */
  await sweepStaleTrash(trashParentDir, trashGlobPrefix);

  if (fs.existsSync(isolateDir)) {
    const trashDir = path.join(
      trashParentDir,
      `${trashGlobPrefix}${process.pid}-${randomBytes(4).toString("hex")}`,
    );

    try {
      await fs.ensureDir(trashParentDir);
      await fs.rename(isolateDir, trashDir);
      log.debug("Moved existing isolate output directory to trash for cleanup");

      /**
       * Fire-and-forget. A concurrent writer can cause `ENOTEMPTY` or
       * `EBUSY` here, but the logical state is already correct: the real
       * `isolateDir` is gone. Any debris left behind will be swept on the
       * next run.
       */
      void fs.remove(trashDir).catch((err: unknown) => {
        log.debug(
          "Background cleanup of trashed isolate directory did not complete:",
          err instanceof Error ? err.message : String(err),
        );
      });
    } catch (err) {
      /**
       * `rename` can fail with `EXDEV` if `trashParentDir` ends up on a
       * different filesystem from `isolateDir`, or with `EPERM` on platforms
       * that disallow renaming busy directories. Fall back to the original
       * behaviour: a straight recursive delete. This preserves correctness
       * at the cost of the race the rename was meant to avoid.
       */
      log.debug(
        "Could not rename existing isolate output directory, falling back to recursive delete:",
        err instanceof Error ? err.message : String(err),
      );

      await fs.remove(isolateDir);
    }
  }

  await fs.ensureDir(isolateDir);
}

/**
 * Build a stable name stem for the trash directory. When `trashParentDir` is
 * the direct parent of `isolateDir` (the default), this is just the isolate
 * dir's basename. When it isn't (e.g. callers placing trash outside the
 * packed dir), include the relative path so multiple isolate dirs sharing
 * the same trash parent don't collide in the sweep filter.
 */
function buildTrashStem(trashParentDir: string, isolateDir: string): string {
  const relative = path.relative(trashParentDir, isolateDir);

  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    return path.basename(isolateDir);
  }

  return relative.split(path.sep).filter(Boolean).join("-");
}

/**
 * Best-effort sweep of leftover trash directories matching this isolate dir's
 * stem. Failures are swallowed: stale trash is debris, not state, and a
 * subsequent run will get another chance to reap it.
 */
async function sweepStaleTrash(parentDir: string, trashGlobPrefix: string) {
  let entries: string[];
  try {
    entries = await fs.readdir(parentDir);
  } catch {
    /** Parent doesn't exist yet; nothing to sweep. */
    return;
  }

  await Promise.all(
    entries
      .filter((entry) => entry.startsWith(trashGlobPrefix))
      .map((entry) =>
        fs.remove(path.join(parentDir, entry)).catch(() => {
          /** Best-effort. */
        }),
      ),
  );
}
