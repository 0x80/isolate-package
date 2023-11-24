# Isolate Package

Isolate a monorepo workspace package to form a self-contained deployable package
that includes internal dependencies and a compatible lockfile.

<!-- TOC -->

- [Features](#features)
- [Motivation](#motivation)
- [Install](#install)
- [Usage](#usage)
- [Prerequisites](#prerequisites)
  - [Define shared dependencies in the package manifest](#define-shared-dependencies-in-the-package-manifest)
  - [Define "version" field in each package manifest](#define-version-field-in-each-package-manifest)
  - [Define "files" field in each package manifest](#define-files-field-in-each-package-manifest)
  - [Use a flat structure inside your packages folders](#use-a-flat-structure-inside-your-packages-folders)
- [Working with Firebase](#working-with-firebase)
  - [A Quick Start](#a-quick-start)
  - [Deploying from multiple packages](#deploying-from-multiple-packages)
  - [Deploying from the root](#deploying-from-the-root)
- [Configuration Options](#configuration-options)
  - [buildDirName](#builddirname)
  - [excludeLockfile](#excludelockfile)
  - [includeDevDependencies](#includedevdependencies)
  - [isolateDirName](#isolatedirname)
  - [logLevel](#loglevel)
  - [targetPackagePath](#targetpackagepath)
  - [tsconfigPath](#tsconfigpath)
  - [workspacePackages](#workspacepackages)
  - [workspaceRoot](#workspaceroot)
- [Troubleshooting](#troubleshooting)
- [Lockfiles](#lockfiles)
  - [PNPM](#pnpm)
  - [NPM](#npm)
  - [Yarn](#yarn)
  - [A Partial Workaround](#a-partial-workaround)
- [Different Package Managers](#different-package-managers)
- [Using the Firebase Functions Emulator](#using-the-firebase-functions-emulator)
- [The internal packages strategy](#the-internal-packages-strategy)

<!-- /TOC -->

## Features

- Isolate a monorepo package with its internal dependencies to form a
  self-contained installable package.
- Deterministic deployment by generating an isolated lockfile based on the
  existing monorepo lockfile. Currently this feature is only supported for PNPM. See
  [lockfiles](#lockfiles) for more information.
- Zero-config for the vast majority of use-cases, with no manual steps involved.
- Support for PNPM, NPM and Yarn.
- Compatible with the Firebase tools CLI, incl 1st gen and 2nd gen Firebase
  functions deployments.
- Uses a pack/unpack approach to isolate only those files that would have been
  part of a published NPM package.
- Isolates internal workspace dependencies recursively. If package A depends on
  internal package B which depends on internal package C, all of them will be
  included.
- Optionally include devDependencies in the isolated output.

## Motivation

This solution was born from a desire to deploy to
[Firebase](https://firebase.google.com/) from a monorepo without resorting to
hacks, shell scripts and manual tasks. Here is [an
article](https://medium.com/p/e685de39025e) explaining the issue in more detail.

It is important to note that there is nothing Firebase-specific to this approach
and there should be other use-cases for it.

## Install

Run `pnpm install isolate-package --dev` or the equivalent for `yarn` or `npm`.

I recommend using `pnpm` for [a number of
reasons](https://pnpm.io/feature-comparison). Also, at the time of writing it is
the only package manger that isolate-package can generate an [isolated
lockfile](#lockfiles) for.

## Usage

If you arrived here for your Firebase deployments check out the [Firebase quick
start guide](#a-quick-start) .

This package exposes the `isolate` executable. Once installed you can run `npx
isolate` in any package directory _after_ you have build the source files. By
default this will produce a directory at `./isolate` but this can be configured.

You will probably want to add the output directory to your `.gitignore` file.

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

> NOTE: This step is not required if you use the [internal packages
> strategy](#the-internal-packages-strategy)

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

A few additional files will be included by `pack` automatically, like the
`package.json` and `README.md` files.

**Tip** If you deploy to Firebase [2nd
generation](https://firebase.google.com/docs/firestore/extend-with-functions-2nd-gen)
functions, you might want to include some .env files in the "files" list, so
they are packaged and deployed together with your build output (as 1st gen
functions config is no longer supported).

### Use a flat structure inside your packages folders

At the moment, nesting packages inside packages is not supported.

When building the registry of all internal packages, `isolate` doesn't drill
down into the folders. So if you declare your packages to live in `packages/*`
it will only find the packages directly in that folder and not at
`packages/nested/more-packages`.

You can, however, declare multiple workspace packages directories. Personally, I
prefer to use `["packages/*", "apps/*", "services/*"]`. It is only the structure
inside them that should be flat.

## Working with Firebase

### A Quick Start

If you are not confident that your monorepo setup is solid, please check out my
in-dept example at [mono-ts](https://github.com/0x80/mono-ts) where many
different aspects are discussed and `isolate-package` is used to demonstrate
Firebase deployments.

This section describes the steps required for Firebase deployment, assuming:

- You use a fairly typical monorepo setup
- Your `firebase.json` config lives in the root of the package that you like to
  deploy to Firebase, hereafter referred to as the "target package".

If your setup diverges from a traditional one, please continue reading the
[Prerequisites](#prerequisites) section.

1. In the target package, install `isolate-package` and `firebase-tools` by
   running `pnpm add isolate-package firebase-tools -D` or the Yarn / NPM
   equivalent. I tend to install firebase-tools as a devDependency in every
   Firebase package, but you could also use a global install if you prefer that.
2. In the `firebase.json` config set `"source"` to `"./isolate"` and
   `"predeploy"` to `["turbo build", "isolate"]` or whatever suits your build
   tool. The important part here is that isolate is being executed after the
   build stage.
3. From the target package folder, you should now be able to deploy with `npx
firebase deploy`.

I recommend keeping a `firebase.json` file inside each Firebase package (as
opposed to the monorepo root), because it allows you to deploy from multiple
independent packages. It makes it easy to deploy 1st gen functions next to 2nd
gen functions, deploy different node versions, and decrease the built output
size and dependency lists for each package, improving deployment and cold-start
times.

### Deploying from multiple packages

You can deploy to Firebase from multiple packages in your monorepo, in which
case you co-locate your `firebase.json` file with the source code, and not in
the root of the monorepo. If you do want to keep the firebase config in the
root, read the instructions for [deploying to Firebase from the
root](#deploying-to-firebase-from-the-root).

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

With this configuration you can then run `npx firebase deploy --only functions`
from the package.

If you like to deploy to Firebase Functions from multiple packages you will also
need to configure a unique `codebase` identifier for each of them. For more
information, [read
this](https://firebase.google.com/docs/functions/beta/organize-functions).

Make sure your Firebase package adheres to the things mentioned in
[prerequisites](#prerequisites) and its package manifest contains the field
`"main"`, or `"module"` if you set `"type": "module"`, so Firebase knows the
entry point to your source code.

### Deploying from the root

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

For most users no configuration should be necessary.

You can configure the isolate process by placing a `isolate.config.json` file in
the package that you want to isolate, except when you're [deploying to Firebase
from the root of the workspace](#deploying-firebase-from-the-root).

For the config file to be picked up, you will have to execute `isolate` from the
same location, as it uses the current working directory.

Below you will find a description of every available option.

### buildDirName

Type: `string | undefined`, default: `undefined`

The name of the build output directory name. When undefined it is automatically
detected via `tsconfig.json`. When you are not using Typescript you can use this
setting to specify where the build output files are located.

### excludeLockfile

Type: `boolean`, default: Depends on package manager.

Sets the inclusion or exclusion of the lockfile as part of the deployment.

PNPM lockfiles are regenerated based on the isolated output, so they are
included by default.

For NPM and Yarn the lockfiles are excluded by default because they are
currently copied as-is to the isolate output and can lead to issues during
deployment installs. For more information see [lockfiles](#lockfiles).

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

## Troubleshooting

If something is not working as expected, add a `isolate.config.json` file, and
set `"logLevel"` to `"debug"`. This should give you detailed feedback in the
console.

In addition define an environment variable to debug the configuration being used
by setting `ISOLATE_CONFIG_LOG_LEVEL=debug` before you execute `isolate`

When debugging Firebase deployment issues it might be convenient to trigger the
isolate process manually with `npx isolate` and possibly
`ISOLATE_CONFIG_LOG_LEVEL=debug npx isolate`

## Lockfiles

Deploying the isolated code together with a valid lockfile turned out to be the
biggest challenge of this solution.

A lockfile in a monorepo describes the dependencies of all packages, and does
not necessarily translate to the isolated output without altering it. Different
package managers use very different formats, and it is not enough to just go in
and change some paths.

It is also not enough to simply generate a brand new lockfile from the isolated
code, because the versions in that lockfile are likely to diverge from what you
have in your monorepo lockfile.

What we need is to re-generate a lockfile for the isolated output based on the
versions that were locked in the monorepo lockfile.

### PNPM

For PNPM a new isolated lockfile is generated.

### NPM

For now, NPM lockfiles are simply copied over to the isolated output. I have
seen Firebase deployments work with it, but likely you are going to run into an
error like this:

> `npm ci` can only install packages when your package.json and
> package-lock.json or npm-shrinkwrap.json are in sync. Please update your lock
> file with `npm install` before continuing.

If you experience this issue, you can choose to exclude the lockfile from
deployment by setting `"excludeLockfile": false` in your isolate.config.json
file, or make the move to PNPM (recommended).

A real solution, regenerating an isolated lockfile, should be possible based on
the [NPM CLI
Arborist](https://github.com/npm/cli/tree/latest/workspaces/arborist) code, so I
plan to look into that in the near future.

### Yarn

For now, Yarn lockfiles are simply copied over to the isolated output. I believe
I have seen Firebase deployments work with it, but it is likely you will run
into an error.

If you experience an issue, you can choose to exclude the lockfile from
deployment by setting `"excludeLockfile": false` in your isolate.config.json
file, or make the move to PNPM (recommended).

I am not aware of any code in the official Yarn repository for re-generating a
lockfile, and I am reluctant to work on this feature based on user-land code.

Personally, I do not think Yarn is very relevant anymore in 2023 and I recommend
switching to PNPM.

### A Partial Workaround

If you can not use a lockfile, because you depend on NPM or Yarn, a partial
workaround would be to declare dependencies using exact versions in your package
manifest. This doesn't prevent your dependencies-dependencies from installing
newer versions, like a lockfile would, but at least you minimize the risk of
things breaking.

## Different Package Managers

Isolate package has been designed to work with all package managers, although
[PNPM is recommended](https://pnpm.io/feature-comparison), especially for
monorepo environments.

The isolation process will infer the package manager name and version from the
type of lockfile found and the version that the OS reports for the installed
executable. This information is then used to change some of its behavior. For
example, the PNPM `pack` process is preferred over the default NPM `pack` if
PNPM in used, simply because it seems to be much faster.

The Firebase cloud deploy pipeline will use the package manager that matches
lockfile that was found in the deployed package.

## Using the Firebase Functions Emulator

The Firebase functions emulator runs on the code that firebase.json `source`
points to. Unfortunately, this is the same field as is used for declaring the
code for deployment, which means the emulator is looking at the isolated output.

As a result, any changes to your code have to go through the isolate process in
order to be picked up by the emulator. In other words, changes do not propagate
automatically while the emulator is running.

The workaround I use at the moment is to create a "emulate" script in the
package manifest which does the same as the Firebase predeploy, and then starts
the emulator. For example:

`turbo build && isolate && firebase emulators:start --only functions`

You will still have to stop and restart the emulator on every code change, which
is unfortunate of course.

A real solution to this would be to integrate isolate-package into the
firebase-tools `deploy` command, so it is only executed as part of the
deployment process and the `source` property can still point to the original
code.

I plan to work on this once isolate-package is bit more mature.

## The internal packages strategy

Recently I changed [my example monorepo setup](https://github.com/0x80/mono-ts)
to include [the internal packages
strategy](https://turbo.build/blog/you-might-not-need-typescript-project-references),
(in which the package manifest entries point directly to TS source files, to
omit the build step), and I was pleased to discover that the approach is
compatible with `isolate-packages` with only a single change in configuration.

In summary this is how it works:

1. The package to be deployed lists its internal dependencies as usual, but the
   package manifests of those dependencies point directly to the Typescript
   source (and types).
2. You configure the bundler of your target package to include the source code
   for those internal packages in its output bundle. In the case of TSUP for the
   [API service in the
   mono-ts](https://github.com/0x80/mono-ts/blob/main/services/api/tsup.config.ts)
   that configuration is: `noExternal: ["@mono/common"]`
3. When `isolate` runs, it does the exact same thing as always. It will detect
   the internal packages, copies them to the isolate output folder and adjusts
   any links.
4. When deploying to Firebase, the cloud pipeline will treat the package
   manifest as usual, which installs the listed dependencies and any
   dependencies listed in the linked internal package manifests.

Steps 3 and 4 are no different from a traditional setup.

Note that the manifests for the internal packages will still point to the
Typescript source files, but since the shared code was embedded in the deployed
bundle, they will never be referenced via import statements and as a result the
entry points remain unused. The only reason the packages are included in the
isolated output is so that the package manager knows what dependencies to
install.
