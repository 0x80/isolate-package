# Isolate Package

Isolate a monorepo workspace package so that it can be deployed as a completely
self-contained directory with the sources of all its local dependencies
included.

## Motivation

This solution was developed out of a desire to deploy to
[Firebase](https://firebase.google.com/) from a monorepo without resorting to
hacks, shell scripts and manual tasks. I have written an article explaining the
issue [here](https://medium.com/p/e685de39025e).

There is nothing Firebase specific to this solution but I am currently not aware
of other reasons to isolate a workspace package. If you find a different
use-case, I would love to hear about it.

## Features

- Zero-config for the vast majority of use-cases, with no manual steps involved.
- Designed to support NPM, Yarn and PNPM workspaces.
- Compatible with the Firebase tools CLI.
- Uses a pack/unpack approach to isolate only those files that would have been
  part of a published package, so the resulting output contains a minimal amount
  of files.
- Isolates dependencies recursively. If package A depends on local package B
  which depends on local package C, all of them will be isolated.
- Include and (in the case of PNPM) update the lockfile so the isolated
  deployment should be deterministic.
- Optionally choose to include dev dependencies in the isolated output.

## Prerequisites

Because historically different approaches to monorepos exist, we need to
establish some basic rules for the isolate process to work.

### Define shared package dependencies in the manifest

This one might sound obvious, but if the `package.json` from the package you are
targeting does not list the other monorepo packages it depends on, in either the
`dependencies` or `devDependencies` list, then the isolate process will not
include them in the output.

How dependencies are listed with regards to versioning is not important, because
packages are matched based on their name. For example the following flavors all
work:

```cjson
// package.json
{
  "dependencies": {
    "shared-package": "workspace:*",
    "shared-package": "*",
    "shared-package": "../shared-package",
    "shared-package": "^1.0.0"
  }
}
```

So basically, version information is ignored, and if the package name can be
found in the list of local monorepo packages, it will be processed regardless of
its version specifier.

### Define "files" in each manifest

The isolate process uses (p)npm `pack` to extract files from package
directories, just like publishing a package would.

So for this to work it is required that you define the `files` property in each
`package.json` manifest, as it declares what files should be included in the
published output.

Typically the value contains an array with just the name of the build output
directory, for example:

```cjson
// package.json
{
  "files": ["dist"]
}
```

A few additional files will be included by `pack` automatically, like the
`package.json` and `README.md` files.

### Use a flat structure inside your packages folders

At the moment, nesting packages inside packages is not supported.

When building the registry of all local packages, `isolate` doesn't drill down
into the folders. So if you declare your packages to live in `packages/*` it
will only find the packages directly in that folder and not at
`packages/nested/more-packages`.

You can, however, declare multiple packages folders like `["packages/*",
"apps/*"]`. It's just that the structure inside them should be flat.

## Usage

Run `npm install isolate-package --dev` or the equivalent for `yarn` or
`pnpm`.

This package exposes the `isolate` executable. Once installed you can run `npx
isolate` in any package directory _after_ you have build the source files. By
default this will produce a directory at `./isolate` but this can be configured.

You will probably want to add the output directory to your `.gitignore` file.

### Deploying to Firebase

You can deploy to Firebase from multiple packages in your monorepo, so I advise
you to co-locate your `firebase.json` file with the source code, and not place
it in the root of the monorepo. If you do want to keep the firebase config in
the root, some additional configuration is required, so read on.

In order to deploy to Firebase, the `functions.source` setting in
`firebase.json` needs to point to the isolated output folder, which would be
`./isolate` when using the default configuration.

The `predeploy` phase should first build and then isolate the output.

Here's an example using [Turborepo](https://turbo.build/):

```cjson
// firebase.json
{
  "functions": {
    "source": "./isolate",
    "predeploy": ["turbo build", "isolate"]
  }
}
```

With this configuration you can then run `firebase deploy --only functions` from
the package.

If you like to deploy to Firebase Functions from multiple packages you will also
need to configure a unique `codebase` identifier for each of them. For more
information, [read
this](https://firebase.google.com/docs/functions/beta/organize-functions).

Make sure your Firebase package adheres to the things mentioned in
[prerequisites](#prerequisites) and its manifest file contains the field
`"main"`, or `"module"` if you set `"type": "module"`, so Firebase knows the
entry point to your source code.

### Deploying to Firebase from the root

If, for some reason, you choose to keep the `firebase.json` file in the root of
the monorepo you will have to place a configuration file called
`isolate.config.json` in the root with the following content:

```cjson
// isolate.config.json
{
  "targetPackagePath": "./packages/your-firebase-package"
}
```

The Firebase configuration should then look something like this:

```cjson
// firebase.json
{
  "functions": {
    "source": "./packages/your-firebase-package/isolate",
    "predeploy": ["turbo build", "isolate"]
  }
}
```

## Configuration Options

For most users no configuration should be required. You can configure the
isolate process by placing a `isolate.config.json` file in the package that you
want to isolate, except when you're [deploying to Firebase from the root of the
workspace](#deploying-firebase-from-the-root).

For the config file to be picked up, you will have to execute `isolate` from the
same location, as it uses the current working directory.

Below you will find a description of every available option.

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

### isolateDirName

Type: `string`, default: `"isolate"`

The name of the isolate output directory.

### logLevel

Type: `"info" | "debug" | "warn" | "error"`, default: `"info"`.

Because the configuration loader depends on this setting, its output is not
affected by this setting. If you want to debug the configuration set
`ISOLATE_CONFIG_LOG_LEVEL=debug` before you run `isolate`

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

The relative path to the root of the workspace / monorepo. In a typical
repository you will have a `packages` and possibly an `apps` directory, and both
contain packages, so any package you would want to isolate is located 2 levels
up from the root.

For example

```
apps
├─ api
│  ├─ package.json
│  └─ .eslintrc.js
└─ web
   ├─ package.json
   └─ .eslintrc.js
packages
└─ eslint-config-custom
   ├─ index.js
   └─ package.json
```

When you use the `targetPackagePath` option, this setting will be ignored.

## Troubleshooting

If something is not working, I advise you to add a `isolate.config.json` file,
and set `"logLevel"` to `"debug"`. This should give you detailed feedback in the
console.

In addition define an environment variable to debug the configuration being used
by setting `ISOLATE_CONFIG_LOG_LEVEL=debug` before you execute `isolate`

When debugging Firebase deployment issues it might be convenient to trigger the
isolate process manually with `npx isolate` and possibly
`ISOLATE_CONFIG_LOG_LEVEL=debug npx isolate`

## Lockfiles

I inspected the NPM lockfile as well as the Yarn v1 and v3 lockfiles and they
seem to have a flat structure unrelated to the workspace packages structure, so
I have made the assumption that they can be copied to the isolate output as-is.

The PNPM lockfile clearly has a structure describing the different packages by
their relative paths, and so to correct the lockfile it is adapted before being
stored to the isolate directory.

I am not sure the Firebase deploy pipeline is actually detecting a
`pnpm-lock.yaml` file and using PNPM to install its packages. This needs to be
verified...

## Used Terminology

The various package managers, while being very similar, seem to use a different
definition for the term "workspace". If you want to read the code it might be
good to know that I consider the workspace to be the monorepo itself, in other
words, the overall structure that holds all the packages.

Also, in the code you see the word manifest a lot, and it simply means to the
contents of a `package.json` file.

## Binary as ESM module

The `isolate` binary is an ES module. It is required to have the `.mjs` file
extension, otherwise a non-ESM workspace will try to execute it as commonJS. For
details on this read [this article from Alex
Rauschmayer](https://exploringjs.com/nodejs-shell-scripting/ch_creating-shell-scripts.html#node.js-esm-modules-as-standalone-shell-scripts-on-unix)

For PNPM the hashbang at the top of the script was not required, but Yarn 3 did
not seem to execute without it.
