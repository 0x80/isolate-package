# Isolate Package

Isolate a monorepo workspace package so that it can be deployed as a completely
self-contained directory with the sources of all its local dependencies
included.

**NOTE**: This package has only been tested with [PNPM](https://pnpm.io/) but it
was designed to be compatible with NPM and Yarn. That being said, I am
personally very happy with the switch to PNPM and I encourage anyone to give it
a try.

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

## Usage

Run `npm install isolate-package --dev` or do the equivalent for `yarn` or
`pnpm`.

This package exposes the `isolate` executable. Once installed you can run `npx
isolate` in any package directory _after_ you have build the source files. By
default this will produce a directory at `./isolate` but this can be configured.

You will probably want to add the output directory to your `.gitignore` file.

### Deploying to Firebase

You can deploy to Firebase from multiple packages in your monorepo, so I advise
you to co-locate your `firebase.json` file with the source code, and not place
it in the root of the monorepo.

In order to deploy to Firebase, the `functions.source` setting in
`firebase.json` needs to point to the isolated output folder, which would be
`./isolate` when using the default configuration.

The `predeploy` phase should first build and then isolate the output.

Here's an example using [Turborepo](https://turbo.build/):

```json
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

## Configuration

For most users the defaults are fine and no configuration is needed. Otherwise,
you can configure the isolate process by placing a `isolate.config.json` file in
the root of the package that you want to isolate.

Below you find a description of every available config option.

### logLevel

Type: `"info" | "debug" | "warn" | "error"`, default: `"info"`.

Because the configuration loader depends on this setting, its output is not
affected by this setting. If you want to debug the configuration set
`ISOLATE_CONFIG_LOG_LEVEL=debug` before you run `isolate`

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

### workspacePackages

Type: `string[] | undefined`, default: `undefined`

When workspacePackages is not defined, `isolate` will try to find the packages
in the workspace by looking up the settings in `pnpm-workspace.yaml` or
`package.json` files depending on the detected package manager.

In case this fails, you can override this process by specifying globs manually.
For example `"workspacePackages": ["packages/*", "apps/*"]`. Paths are relative
from the root of the workspace.

### isolateOutDir

Type: `string`, default: `"isolate"`

The name of the isolate output directory.

### includeDevDependencies

Type: `boolean`, default: `false`

By default devDependencies are ignored and stripped from the isolated output
`package.json` files. If you enable this the devDependencies will be included
and isolated just like the production dependencies.

### tsconfigPath

Type: `string`, default: `"./tsconfig.json"`

The path to the `tsconfig.json` file relative to the package you want to
isolate. The tsconfig is only used for reading the `compilerOptions.outDir`
setting. If no tsconfig is found, possibly because you are not using Typescript
in your project, the process will fall back to the `buildOutputDir` setting.

### buildOutputDir

Type: `string | undefined`, default: `undefined`

When you are not using Typescript you can use this setting to specify where the
build output files are located.

## Lockfiles

I inspected the NPM lockfiles as well as the Yarn v1 and v3 lockfiles and they
seem to have a flat structure unrelated to the workspace packages structure, so
I made the assumption that they can be copied as-is.

The PNPM lockfile clearly has a structure describing the different packages by
their relative paths, and so to correct the lockfile it is adapted before being
copied to the isolate directory.

I am not sure the Firebase deploy pipeline is actually detecting a
pnpm-lock.yaml file and using PNPM to install packages. This needs to be
verified...

## Used Terminology

The various package managers, while being very similar, seem to use a different
definition for the term "workspace". If you want to read the code it might be
good to know that I consider the workspace to be the monorepo itself, in other
words, the overall structure that holds all the packages.

Also, in the code you see the word manifest a lot. It refers to the contents of
a package.json file.
