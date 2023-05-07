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
hacks, shell scripts and manual tasks. You can read more about this issue
[here](#the-problem-with-firebase-in-monorepos).

There is nothing Firebase specific to this solution but I am currently not aware
of other reasons to isolate a workspace package. If you find a different
use-case, I would love to hear about it.

## Features

- Zero-config for the majority of use-cases, with no manual steps involved.
- Designed to support NPM, Yarn and PNPM workspaces.
- Compatible with the Firebase CLI.
- Uses a pack/unpack approach to only isolate files that would have been part of
  the published package, so the resulting output contains a minimal amount of
  files.
- Isolates dependencies recursively. If package A depends on local package B
  which depends on local package C, all of them will be isolated.
- Include and (in the case of PNPM) update the lockfile so the isolated
  deployment should be deterministic.
- Optionally choose to include dev dependencies in the isolated output.

## Usage

Run `pnpm add isolate-package -D` or do the equivalent for `yarn` or `npm`.

This package exposes the `isolate` executable. Once installed you can run `npx
isolate` in any package directory _after_ you have build the source files, and
by default this will produce a directory at `./isolate`.

You will probably want to add the output directory to your `.gitignore` file.

### Deploy to Firebase

This solution allows you to deploy to Firebase from multiple packages in your
monorepo, so I advise you to co-locate your `firebase.json` file with the
package, and not place it in the root of the monorepo.

In order to deploy to Firebase, the `functions.source` setting in
`firebase.json` needs to point to the isolated output folder, which would be
`./isolate` when using the default configuration.

The `predeploy` phase should first build and then isolate the output.

Here's an example using [Turborepo](https://turbo.build/) for the build process:

```json
{
  "functions": {
    "source": "./isolate",
    "predeploy": ["turbo build", "isolate"]
  }
}
```

With this configuration you can run `firebase deploy --only functions` from the
package you isolated.

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

The PNPM lockfile (v6.0) has a clear structure describing the different packages
by their paths. To make the lockfile correct it is therefore adapted before
being copied to the isolate directory.

I am not sure the Firebase deploy pipeline is actually detecting a
pnpm-lock.yaml file and using PNPM to install packages. This needs to be
verified.

I looked at the NPM lockfiles as well as the Yarn v1 and v3 lockfiles and they
do not seem to have a flat structure unrelated to the workspace packages, so I
have assumed it is ok to just copy them as-is.

## The problem with Firebase in monorepos

When deploying to Firebase it expects a folder with source files together with a
package.json file. This folder will be zipped and uploaded after which Firebase
will run an npm or yarn install in the cloud as part of the deployment pipeline.

In a private monorepo your Firebase package(s) typically have one or more shared
local dependencies that are never published to NPM. When Firebase tries to look
up those dependencies from the package.json they can not be found and deployment
fails.

In order to solve this you could try to use a bundler like Webpack to include
dependencies code in the bundle and then strip those packages from the list in
the package.json that is sent to Firebase, so doesn't know about them, but this
strategy quickly falls apart. If the shared packages themselves do not bundle
all of their dependencies in their build output, then those dependencies will
still need to be installed, and Firebase wouldn't know about it.

Without Firebase natively supporting monorepos, the only solution seems to be to
bundle each shared workspace dependency in a way that its build output, together
with its package.json file, becomes part of the overall bundle that is uploaded
in the Firebase deployment. This way, Firebase can find each shared package
source code, and also know what dependencies need to be installed to make that
source code work.

There are many different hacks that people have come up with [discussing this
issue](https://github.com/firebase/firebase-tools/issues/653) but they all seem
to come down to this:

- Copy the shared packages to some deployment folder
- Create a modified package.json file for the deployment that points all local
  dependencies to the copied files for each shared dependency.
- Point the Firebase deploy process to that folder

The `isolate` process from this solution takes a similar approach but is more
sophisticated and hides all complexity from the user.

## Used Terminology

The various package managers, while being very similar, seem to use a different
definition for the term "workspace". If you want to read the code it might be
good to know that I consider the workspace to be the monorepo itself, in other
words, the overall structure that holds all the packages.

Also, in the code you see the word manifest a lot. It refers to the contents of
a package.json file.
