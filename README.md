# Isolate Package

<!-- TOC -->

- [TLDR](#tldr)
- [Features](#features)
- [Installation](#installation)
- [Usage](#usage)
- [Troubleshooting](#troubleshooting)
- [Prerequisites](#prerequisites)
  - [Define shared dependencies in the package manifest](#define-shared-dependencies-in-the-package-manifest)
  - [Define "version" field in each package manifest](#define-version-field-in-each-package-manifest)
  - [Define "files" field in each package manifest](#define-files-field-in-each-package-manifest)
  - [Use a flat structure inside your packages folders](#use-a-flat-structure-inside-your-packages-folders)
- [Configuration Options](#configuration-options)
  - [logLevel](#loglevel)
  - [forceNpm](#forcenpm)
  - [buildDirName](#builddirname)
  - [includeDevDependencies](#includedevdependencies)
  - [pickFromScripts](#pickfromscripts)
  - [omitFromScripts](#omitfromscripts)
  - [isolateDirName](#isolatedirname)
  - [targetPackagePath](#targetpackagepath)
  - [tsconfigPath](#tsconfigpath)
  - [workspacePackages](#workspacepackages)
  - [workspaceRoot](#workspaceroot)
- [Lockfiles](#lockfiles)
  - [NPM](#npm)
  - [PNPM](#pnpm)
  - [Classic Yarn](#classic-yarn)
  - [Modern Yarn](#modern-yarn)
- [API](#api)
- [The internal packages strategy](#the-internal-packages-strategy)
- [Firebase](#firebase)

<!-- /TOC -->

## TLDR

Run `npx isolate-package isolate` from the monorepo package you would like to
isolate.

If you would like to see an example of a modern monorepo with this tool
integrated, check out [mono-ts](https://github.com/0x80/mono-ts)

## Features

- Isolate a monorepo workspace package to form a self-contained package that
  includes internal dependencies and an adapted lockfile for deterministic
  deployments.
- Preserve packages file structure, without code bundling
- Should work with any package manager, and tested with NPM, PNPM, and Yarn
  (both classic and modern)
- Zero-config for the vast majority of use-cases
- Isolates dependencies recursively. If package A depends on internal package B
  which depends on internal package C, all of them will be included
- Optionally force output to use NPM with matching versions
- Optionally include devDependencies in the isolated output
- Optionally pick or omit scripts from the manifest
- Compatible with the Firebase tools CLI, including 1st and 2nd generation
  Firebase Functions. For more information see
  [the Firebase instructions](./docs/firebase.md).
- Available in a
  [forked version of firebase-tools](https://github.com/0x80/firebase-tools-with-isolate)
  to preserve live code updates when running the emulators

## Installation

Run `pnpm install isolate-package --dev` or the equivalent for `npm` or `yarn`.

I recommend using `pnpm` for
[a number of reasons](https://pnpm.io/feature-comparison). In my experience it
is the best package manager, especially for monorepo setups, but any other
package manager should work.

## Usage

> !! If you plan use this for Firebase deployments, and you want to preserve
> live code updates when running the local emulators, you will want to use
> [firebase-tools-with-isolate](https://github.com/0x80/firebase-tools-with-isolate)
> instead.

This package exposes a binary called `isolate`.

Run `npx isolate` from the root of the package you want to isolate. Make sure
you build the package first.

The `isolate` binary will try to infer your build output location from a
`tsconfig` file, but see the [buildDirName configuration](#builddirname) if you
are not using Typescript.

By default the isolated output will become available at `./isolate`.

If you are here to improve your Firebase deployments check out the
[Firebase quick start guide](./docs/firebase.md#a-quick-start).

## Troubleshooting

If something is not working as expected, add an `isolate.config.json` file, and
set `"logLevel"` to `"debug"`. This should give you detailed feedback in the
console.

In addition define an environment variable to debug the configuration being used
by setting `DEBUG_ISOLATE_CONFIG=true` before you execute `isolate`.

When debugging Firebase deployment issues it might be convenient to trigger the
isolate process manually with `npx isolate` and possibly
`DEBUG_ISOLATE_CONFIG=true npx isolate`.

## Prerequisites

Because historically many different approaches to monorepos exist, we need to
establish some basic rules for the isolate process to work.

### Define shared dependencies in the package manifest

This one might sound obvious, but if the `package.json` from the package you are
targeting does not list the other monorepo packages it depends on, in either the
`dependencies` or `devDependencies` list, then the isolate process will not
include them in the output.

How dependencies are listed with regards to versioning is not important, because
packages are matched based on their name. For example the following flavors all
work (some depending on your package manager):

```cjson
// package.json
{
  "dependencies": {
    "shared-package": "0.0.0"
    "shared-package": "*",
    "shared-package": "workspace:*",
    "shared-package": "../shared-package",
  }
}
```

So if the a package name can be found as part of the workspace definition, it
will be processed regardless of its version specifier.

### Define "version" field in each package manifest

The `version` field is required for `pack` to execute, because it is use to
generate part of the packed filename. A personal preference is to set it to
`"0.0.0"` to indicate that the version does not have any real meaning.

### Define "files" field in each package manifest

> NOTE: This step is not required if you use the
> [internal packages strategy](#the-internal-packages-strategy) but you could
> set it to `["src"]` instead of `["dist"]`.

The isolate process uses (p)npm `pack` to extract files from package
directories, just like publishing a package would.

For this to work it is required that you define the `files` property in each
package manifest, as it declares what files should be included in the published
output.

Typically the value contains an array with just the name of the build output
directory, for example:

```cjson
// package.json
{
  "files": ["dist"]
}
```

A few additional files from the root or your package will be included by `pack`
automatically, like `package.json`, `LICENSE` and `README` files.

**Tip** If you deploy to Firebase
[2nd generation](https://firebase.google.com/docs/firestore/extend-with-functions-2nd-gen)
functions, you might want to include some env files in the `files` list, so they
are packaged and deployed together with your build output (as 1st gen functions
config is no longer supported).

### Use a flat structure inside your packages folders

At the moment, nesting packages inside packages is not supported.

When building the registry of all internal packages, `isolate` doesn't drill
down into the folders. So if you declare your packages to live in `packages/*`
it will only find the packages directly in that folder and not at
`packages/nested/more-packages`.

You can, however, declare multiple workspace packages directories. Personally, I
prefer to use `["packages/*", "apps/*", "services/*"]`. It is only the structure
inside them that should be flat.

## Configuration Options

For most users no configuration should be necessary.

You can configure the isolate process by placing a `isolate.config.json` file in
the package that you want to isolate, except when you're
[deploying to Firebase from the root of the workspace](#deploying-firebase-from-the-root).

For the config file to be picked up, you will have to execute `isolate` from the
same location, as it uses the current working directory.

Below you will find a description of every available option.

### logLevel

Type: `"info" | "debug" | "warn" | "error"`, default: `"info"`.

Because the configuration loader depends on this setting, its output is not
affected by this setting. If you want to debug the configuration set
`DEBUG_ISOLATE_CONFIG=true` before you run `isolate`

### forceNpm

Type: `boolean`, default: `false`

By default the isolate process will generate output based on the package manager
that you are using for your monorepo. But your deployment target might not be
compatible with that package manager, or it might not be the best choice given
the available tooling.

Also, it should not really matter what package manager is used in de deployment
as long as the versions match your original lockfile.

By setting this option to `true` you are forcing the isolate output to use NPM.
A package-lock file will be generated based on the contents of node_modules and
therefore should match the versions in your original lockfile.

This way you can enjoy using PNPM or Yarn for your monorepo, while your
deployment uses NPM with modules locked to the same versions.

### buildDirName

Type: `string | undefined`, default: `undefined`

The name of the build output directory name. When undefined it is automatically
detected via `tsconfig.json`. When you are not using Typescript you can use this
setting to specify where the build output files are located.

### includeDevDependencies

Type: `boolean`, default: `false`

By default devDependencies are ignored and stripped from the isolated output
`package.json` files. If you enable this the devDependencies will be included
and isolated just like the production dependencies.

### pickFromScripts

Type: `string[]`, default: `undefined`

Select which scripts to include in the output manifest `scripts` field. For
example if you want your test script included set it to `["test"]`.

By default, all scripts are omitted.

### omitFromScripts

Type: `string[]`, default: `undefined`

Select which scripts to omit from the output manifest `scripts` field. For
example if you want the build script interferes with your deployment target, but
you want to preserve all of the other scripts, set it to `["build"]`.

By default, all scripts are omitted, and the [pickFromScripts](#pickfromscripts)
configuration overrules this configuration.

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
setting. If no tsconfig is found, possibly because you are not using Typescript
in your project, the process will fall back to the `buildDirName` setting.

### workspacePackages

Type: `string[] | undefined`, default: `undefined`

When workspacePackages is not defined, `isolate` will try to find the packages
in the workspace by looking up the settings in `pnpm-workspace.yaml` or
`package.json` files depending on the detected package manager.

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

## Lockfiles

The isolate process tries to generate an isolated / pruned lockfile for the
package manager that you use in your monorepo. If the package manager is not
supported (modern Yarn versions), it can still generate a matching NPM lockfile
based on the installed versions in node_modules.

In case your package manager is not supported by your deployment target you can
also choose NPM to be used by setting the `makeNpmLockfile` to `true` in your
configuration.

### NPM

For NPM we use a tool called Arborist which is an integral part of the NPM
codebase. It is executed in the isolate output directory and requires the
adapted lockfile and the `node_modules` directory from the root of the
repository. As this directory is typically quite large, copying it over as part
of the isolate flow is not very desirable.

To work around this, we move it to the isolate output and then move it back
after Arborist has finished doing its thing. Luckily it doesn't take long and
hopefully this doesn't create any unwanted side effects for IDEs and other tools
that depend on the content of the directory.

When errors occur in this process, the folder should still be moved back.

### PNPM

The PNPM lockfile format is very readable (YAML) but getting it adapted to the
isolate output was a bit of a trip.

It turns out, at least up to v10, that the isolated output has to be formatted
as a workspace itself, otherwise dependencies of internally linked packages are
not installed by PNPM. Therefore, the output looks a bit different from other
package managers:

- Links are preserved
- Versions specifiers like "workspace:\*" are preserved
- A pnpm-workspace.yaml file is added to the output

### Classic Yarn

For Yarn v1 we can simply copy the root lockfile to the isolate output, and run
a `yarn install` to prune that lockfile. The command finds the installed node
modules in the root of the monorepo so versions are preserved.

> Note: I expect this to break down if you configure the isolate output
> directory to be located outside the monorepo tree.

### Modern Yarn

For modern Yarn versions we fall back to using NPM for the output lockfile,
because the strategy of running `yarn install` does not seem to apply here.

Based on the installed node_modules we generate an NPM lockfile that matches the
versions in the Yarn lockfile. It should not really matter what package manager
your deployed code uses, as long as the lockfile versions match with the
original lockfile.

## API

Alternatively, `isolate` can be integrated in other programs by importing it as
a function. You optionally pass it a some user configuration and possibly a
logger to handle any output messages should you need to write them to a
different location as the standard `node:console`.

```ts
import { isolate } from "isolate-package";

await isolate({
  config: { logLevel: "debug" },
  logger: customLogger,
});
```

If no configuration is passed in, the process will try to read
`isolate.config.json` from the current working directory.

## The internal packages strategy

An alternative approach to using internal dependencies in a Typescript monorepo
is
[the internal packages strategy](https://turbo.build/blog/you-might-not-need-typescript-project-references),
in which the package manifest entries point directly to Typescript source files,
to omit intermediate build steps. The approach is compatible with
isolate-package and showcased in
[my example monorepo setup](https://github.com/0x80/mono-ts)

In summary this is how it works:

1. The package to be deployed lists its internal dependencies as usual, but the
   package manifests of those dependencies point directly to the Typescript
   source (and types).
2. You configure the bundler of your target package to include the source code
   for those internal packages in its output bundle. In the case of TSUP for the
   [API service in the mono-ts](https://github.com/0x80/mono-ts/blob/main/services/api/tsup.config.ts)
   that configuration is: `noExternal: ["@mono/common"]`
3. When `isolate` runs, it does the same thing as always. It detects the
   internal packages, copies them to the isolate output folder and adjusts any
   links.
4. When deploying to Firebase, the cloud pipeline will treat the package
   manifest as usual, which installs the listed dependencies and any
   dependencies listed in the linked internal package manifests.

Steps 3 and 4 are no different from a traditional setup.

Note that the manifests for the internal packages in the output will still point
to the Typescript source files, but since the shared code was embedded in the
bundle, they will never be referenced via import statements. So the manifest the
entry declarations are never used. The reason the packages are included in the
isolated output is to instruct package manager to install their dependencies.

## Firebase

For detailed information on how to use isolate-package in combination with
Firebase [see this documentation](./docs/firebase.md#firebase)
