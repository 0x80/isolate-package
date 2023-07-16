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

In the documentation and code you will see the word "manifest" a lot, and it
simply means to the contents of a `package.json` file.

## Features

- Zero-config for the vast majority of use-cases, with no manual steps involved.
- Support NPM, Yarn classic (v1) and current (v3) and PNPM.
- Fully compatible with the Firebase tools CLI, supporting 1st gen and 2nd gen
  Firebase functions.
- Uses a pack/unpack approach to isolate only the files that would have been
  part of a published package, so the output contains a minimal set of files.
- Isolates shared dependencies recursively. If package A depends on local
  package B which depends on local package C, all of them will be isolated.
- Includes the lockfile so the isolated deployment should be deterministic. PNPM
  lockfiles are not supported yet. See [lockfiles](#lockfiles) for more info.
- Optionally include devDependencies in the isolated output.

## Firebase Deployment Quickstart

This describes the steps required for Firebase deployment, assuming:

- You use a fairly typical monorepo setup
- Your `firebase.json` config lives in the root of the package that you like to
  deploy to Firebase, hereafter referred to as the "target package".

If you use a different setup, just continue reading the
[Prerequisites](#prerequisites) section.

1. In the target package, install isolate-package and firebase-tools by running
   `pnpm add isolate-package firebase-tools -D` or the Yarn / NPM equivalent. I
   like to install firebase-tools as a devDependency in every firebase package,
   but you could of course also use a global install if you prefer.
2. In the `firebase.json` config set `"source"` to `"./isolate"` and
   `"predeploy"` to `["turbo build", "isolate"]` or whatever suits your build
   tool.
3. From the target package root, you should now be able to deploy with `npx
firebase deploy` or `npx firebase deploy --only functions` in case your package
   only contains code for Firebase functions.

I recommend keeping a `firebase.json` file inside each Firebase package (as
opposed to the monorepo root), because it allows you to deploy from multiple
independent packages. This give you more flexibility to organize your code. It
also makes it easy to deploy 1st gen functions next to 2nd gen functions, or mix
different node versions should you want to. Your bundle sizes and dependency
lists for each function might also decrease, which improves cold-start times.

## Prerequisites

Because historically many different approaches to monorepos exist, we need to
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

### Define "files" and "version" in each manifest

The isolate process uses (p)npm `pack` to extract files from package
directories, just like publishing a package would.

For this to work it is required that you define the `files` property in each
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

The `version` field is also required for `pack` to execute. I personally always
set it to `"0.0.0"` to indicate that the version does not have a practical
function.

A few additional files will be included by `pack` automatically, like the
`package.json` and `README.md` files.

**Tip** If you deploy to Firebase [2nd
generation](https://firebase.google.com/docs/firestore/extend-with-functions-2nd-gen)
functions, you might want to include some .env files in the "files" list, so
they are packaged and deployed together with your build output (as 1st gen
functions config is no longer supported).

### Use a flat structure inside your packages folders

At the moment, nesting packages inside packages is not supported.

When building the registry of all local packages, `isolate` doesn't drill down
into the folders. So if you declare your packages to live in `packages/*` it
will only find the packages directly in that folder and not at
`packages/nested/more-packages`.

You can, however, declare multiple packages folders like `["packages/*",
"apps/*"]`. It's just that the structure inside them should be flat.

## Usage

Run `npm install isolate-package --dev` or the equivalent for `yarn` or `pnpm`.

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

### excludeLockfile

Type: `boolean`, default: Depends on package manager.

Sets the inclusion or exclusion of the lockfile as part of the deployment. For
Yarn and NPM the lockfiles are included by default, but for PNPM they are
excluded by default because they are not supported yet. For more information see
[lockfiles](#lockfiles).

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

The lockfiles for NPM as well as the Yarn v1 and v3 seem to have a flat
structure unrelated to the workspace packages structure, so they are copied to
the isolate output as-is.

The PNPM lockfile clearly has a structure describing the different packages by
their relative paths, and so to correct the lockfile it is adapted before being
stored to the isolate directory.

### NPM

It seems that when using NPM the `npm ci` can fail with a message like:

> `npm ci` can only install packages when your package.json and
> package-lock.json or npm-shrinkwrap.json are in sync. Please update your lock
> file with `npm install` before continuing.

I haven't been able to figure out what causes this. I have seen NPM deploys
working with lockfiles, but I can not reliably reproduce it.

If you experience this issue I have two suggestions:

- Upgrade to Node 18 by setting the `"runtime": "nodejs18"` in your
  firebase.json config. Note that you most likely also have to re-create your
  lockfile using Node 18.
- Exclude the lockfile from deployment by setting `"excludeLockfile": false` in
  your isolate.config.json file.

I hope we can eventually figure out what is causing this, but more investigation
is required.

### PNPM Lockfiles disabled for now

There is still [an issue with the PNPM lockfile
conversion](https://github.com/0x80/isolate-package/issues/5) which makes it
unusable at the moment. Until that is resolved, the lockfile is automatically
excluded for PNPM.

Personally I also use PNPM, and I don't see this as a big problem, because, like
most of us, I declare versions with `^` in my manifest. This means that
dependencies can only resolve to newer patch versions, but I am not using
dependencies that are likely to break on patch version changes.

## Different Package Managers

Isolate package has been designed to work with all package managers. It has been
testing it with NPM 8, 9, Yarn 1.22, Yarn 3.6 and PNPM 8.

The isolate process will infer the package manager name and version from the
type of lockfile found and the version that the OS reports for the installed
executable. This information is then used to change some of its behavior. For
example, the PNPM `pack` process is preferred over the default NPM `pack` if
PNPM in used, simply because it seems to be much faster.

The Firebase cloud deploy pipeline will use the package manager that matches
lockfile that was found in the deployed package.

### Yarn v1 and v3

If you are using Yarn 3 with zero-installs, the deployed package is not aware of
that, because the `.yarnrc` file and `.yarn` folder are located in the root of
your monorepo, and the version is not recorded as part of the lockfile. Therefor
the Firebase deploy cloud pipeline will use Yarn 1 to install your dependencies.
I don't think that is an issue but it might be good to know.
