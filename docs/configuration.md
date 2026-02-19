# Configuration

For most users no configuration should be necessary.

You can configure the isolate process by placing a config file in the package
that you want to isolate, except when you're
[deploying to Firebase from the root of the workspace](/deploying-to-firebase#deploying-from-the-root).
Alternatively, all options can be set via [CLI flags](/cli-reference).

## Config File Formats

The following config file formats are supported (in order of precedence):

- `isolate.config.ts` — TypeScript (requires Node 22.6+ for native TS support)
- `isolate.config.js` — JavaScript (ESM)
- `isolate.config.json` — JSON

TypeScript and JavaScript config files should use a default export. You can use
the `defineConfig` helper for type checking:

```ts
import { defineConfig } from "isolate-package";

export default defineConfig({
  workspaceRoot: "../..",
});
```

For the config file to be picked up, you will have to execute `isolate` from the
same location, as it uses the current working directory.

## Options

### logLevel

Type: `"info" | "debug" | "warn" | "error"`, default: `"info"`.

Because the configuration loader depends on this setting, its output is not
affected by this setting. If you want to debug the configuration set
`DEBUG_ISOLATE_CONFIG=true` before you run `isolate`.

### forceNpm

Type: `boolean`, default: `false`

By default the isolate process will generate output based on the package manager
that you are using for your monorepo, but your deployment target might not be
compatible with that package manager.

It should not really matter what package manager is used in the deployment as
long as the versions match your original lockfile.

By setting this option to `true` you are forcing the isolate output to use NPM.
A package-lock file will be generated based on the contents of node_modules and
therefore should match the versions in your original lockfile.

This way you can enjoy using PNPM, Yarn, or Bun for your monorepo, while your
deployment requires NPM.

### buildDirName

Type: `string | undefined`, default: `undefined`

The name of the build output directory name. When undefined it is automatically
detected via `tsconfig.json`. When you are not using TypeScript you can use this
setting to specify where the build output files are located.

### includeDevDependencies

Type: `boolean`, default: `false`

By default devDependencies are ignored and stripped from the isolated output
`package.json` files. If you enable this the devDependencies will be included
and isolated just like the production dependencies.

Note: Dev-only internal packages (like ESLint configs) that are included through
this option don't require a `files` field in their package.json, only a
`version` field. Production dependencies always require both `version` and
`files` fields.

### pickFromScripts

Type: `string[]`, default: `undefined`

Select which scripts to include in the output manifest `scripts` field. For
example if you want your test script included set it to `["test"]`.

By default, all scripts are omitted.

### omitFromScripts

Type: `string[]`, default: `undefined`

Select which scripts to omit from the output manifest `scripts` field. For
example if the build script interferes with your deployment target, but you want
to preserve all of the other scripts, set it to `["build"]`.

By default, all scripts are omitted, and the [pickFromScripts](#pickfromscripts)
configuration overrules this configuration.

### omitPackageManager

Type: `boolean`, default: `false`

By default the packageManager field from the root manifest is copied to the
target manifest. I have found that some platforms (Cloud Run, April 2024) can
fail on this for some reason. This option allows you to omit the field from the
isolated package manifest.

### isolateDirName

Type: `string`, default: `"isolate"`

The name of the isolate output directory.

### targetPackagePath

Type: `string`, default: `undefined`

Only when you decide to place the isolate configuration in the root of the
monorepo, you use this setting to point it to the target you want to isolate,
e.g. `./packages/my-firebase-package`.

If this option is used the `workspaceRoot` setting will be ignored and assumed
to be the current working directory.

### tsconfigPath

Type: `string`, default: `"./tsconfig.json"`

The path to the `tsconfig.json` file relative to the package you want to
isolate. The tsconfig is only used for reading the `compilerOptions.outDir`
setting. If no tsconfig is found, possibly because you are not using TypeScript
in your project, the process will fall back to the `buildDirName` setting.

### workspacePackages

Type: `string[] | undefined`, default: `undefined`

When workspacePackages is not defined, `isolate` will try to find the packages
in the workspace by looking up the settings in `pnpm-workspace.yaml` or
`package.json` depending on the detected package manager.

In case this fails, you can override this process by specifying globs manually.
For example `"workspacePackages": ["packages/*", "apps/*"]`. Paths are relative
from the root of the workspace.

### workspaceRoot

Type: `string`, default: `"../.."`

The relative path to the root of the workspace / monorepo. In a typical setup
you will have a `packages` directory and possibly also an `apps` and a
`services` directory, all of which contain packages. So any package you would
want to isolate is located 2 levels up from the root.

For example

```
packages
├─ backend
│  └─ package.json
└─ ui
   └─ package.json
apps
├─ admin
│  └─ package.json
└─ web
   └─ package.json
services
└─ api
   └─ package.json
```

When you use the `targetPackagePath` option, this setting will be ignored.
