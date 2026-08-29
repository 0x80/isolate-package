import { readWantedLockfile as readWantedLockfile_v8 } from "pnpm_lockfile_file_v8";
/**
 * The `_v9` alias names the lockfile format, not the package. It resolves to
 * `@pnpm/lockfile.fs`, the maintained successor of `@pnpm/lockfile-file`.
 * The older package cannot read the two-document lockfile that pnpm 12 writes.
 */
import { readWantedLockfile as readWantedLockfile_v9 } from "pnpm_lockfile_file_v9";

/**
 * Read a workspace lockfile with the reader for its pnpm major version.
 * A missing lockfile resolves to `null`. Filesystem and parse errors propagate
 * so each consumer can apply its own fallback or reporting policy.
 */
export async function readPnpmLockfile(
  lockfileDirectory: string,
  majorVersion: number,
) {
  if (majorVersion >= 9) {
    return readWantedLockfile_v9(lockfileDirectory, {
      ignoreIncompatible: false,
    });
  }

  return readWantedLockfile_v8(lockfileDirectory, {
    ignoreIncompatible: false,
  });
}
