import { readWantedLockfile as readWantedLockfile_v8 } from "pnpm_lockfile_file_v8";
/**
 * The `_v9` alias names the lockfile format, not the package. It resolves to
 * `@pnpm/lockfile.fs`, the maintained successor of `@pnpm/lockfile-file`.
 * The older package cannot read the two-document lockfile that pnpm 12 writes.
 */
import { readWantedLockfile as readWantedLockfile_v9 } from "pnpm_lockfile_file_v9";

type PnpmLockfile =
  | Awaited<ReturnType<typeof readWantedLockfile_v8>>
  | Awaited<ReturnType<typeof readWantedLockfile_v9>>;

type ReadPnpmLockfileOptions =
  | { onFailure?: "throw" }
  | { onFailure: "return-undefined" }
  | { onFailure: "return-error" };

export function readPnpmLockfile(
  lockfileDirectory: string,
  majorVersion: number,
  options?: { onFailure?: "throw" },
): Promise<PnpmLockfile>;

export function readPnpmLockfile(
  lockfileDirectory: string,
  majorVersion: number,
  options: { onFailure: "return-undefined" },
): Promise<PnpmLockfile | undefined>;

export function readPnpmLockfile(
  lockfileDirectory: string,
  majorVersion: number,
  options: { onFailure: "return-error" },
): Promise<PnpmLockfile | { readError: unknown }>;

/**
 * Read a workspace lockfile with the reader for its pnpm major version.
 * A missing lockfile always resolves to `null`. Filesystem and parse errors
 * throw by default, resolve to `undefined` with `return-undefined`, or resolve
 * to `{ readError }` with `return-error`. This keeps each consumer's failure
 * policy explicit without exposing either versioned reader.
 */
export async function readPnpmLockfile(
  lockfileDirectory: string,
  majorVersion: number,
  options: ReadPnpmLockfileOptions = {},
) {
  try {
    if (majorVersion >= 9) {
      return await readWantedLockfile_v9(lockfileDirectory, {
        ignoreIncompatible: false,
      });
    }

    return await readWantedLockfile_v8(lockfileDirectory, {
      ignoreIncompatible: false,
    });
  } catch (error) {
    if (options.onFailure === "return-undefined") {
      return void 0;
    }

    if (options.onFailure === "return-error") {
      return { readError: error };
    }

    throw error;
  }
}
