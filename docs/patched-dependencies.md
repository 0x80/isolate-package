# Patched Dependencies

If your workspace uses
[PNPM's patched dependencies](https://pnpm.io/cli/patch) or
[Bun's patch support](https://bun.sh/docs/install/patch), `isolate` will
automatically copy the relevant patch files to the isolated output.

## How It Works

Patches are filtered based on the target package's dependencies:

- Patches for production dependencies are always included
- Patches for dev dependencies are only included when
  [`includeDevDependencies`](/configuration#includedevdependencies) is enabled
- Patches for packages not in the target's dependency tree are excluded

The patch files are copied to the isolated output, preserving their original
directory structure. pnpm 9 and 10 store each patch path and hash in the
lockfile. pnpm 11 and later store the hash in the lockfile and the copied patch
path in `pnpm-workspace.yaml`. Bun stores patch paths in `package.json`.
