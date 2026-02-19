# Patched Dependencies

If your workspace uses PNPM's [patched dependencies](https://pnpm.io/cli/patch)
feature, `isolate` will automatically copy the relevant patch files to the
isolated output.

## How It Works

Patches are filtered based on the target package's dependencies:

- Patches for production dependencies are always included
- Patches for dev dependencies are only included when
  [`includeDevDependencies`](/configuration#includedevdependencies) is enabled
- Patches for packages not in the target's dependency tree are excluded

The patch files are copied to the isolated output, preserving their original
directory structure. Both the `package.json` and `pnpm-lock.yaml` are updated
with the correct paths.
