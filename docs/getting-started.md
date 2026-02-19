# Getting Started

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

```
"shared-package": "0.0.0"
"shared-package": "*"
"shared-package": "workspace:*"
"shared-package": "../shared-package"
```

So if a package name can be found as part of the workspace definition, it will be
processed regardless of its version specifier.

### Define "version" field in each package manifest

The `version` field is required for `pack` to execute, because it is used to
generate part of the packed filename. A personal preference is to set it to
`"0.0.0"` to indicate that the version does not have any real meaning.

### Define "files" field in each package manifest

::: info
This step is not required if you use the
[internal packages strategy](/internal-packages) but you could set it to
`["src"]` instead of `["dist"]`.

When using `includeDevDependencies`, packages that are only dev dependencies
(like ESLint configs or other build tools) don't require a `files` field since
they are not packed for deployment.
:::

The isolate process uses (p)npm `pack` to extract files from package
directories, just like publishing a package would.

For production dependencies, it is required that you define the `files` property
in each package manifest, as it declares what files should be included in the
published output.

Typically, the value contains an array with only the name of the build output
directory. For example:

```jsonc
// package.json
{
  "files": ["dist"],
}
```

A few additional files from the root of your package will be included
automatically, like the `package.json`, `LICENSE` and `README` files.

::: tip
If you deploy to Firebase
[2nd generation](https://firebase.google.com/docs/firestore/extend-with-functions-2nd-gen)
functions, you might want to include some env files in the `files` list, so they
are packaged and deployed together with your build output (as 1st gen functions
config is no longer supported).
:::

### Use a flat structure inside your packages folders

At the moment, nesting packages inside packages is not supported.

When building the registry of all internal packages, `isolate` doesn't drill
down into the folders. So if you declare your packages to live in `packages/*`
it will only find the packages directly in that folder and not at
`packages/nested/more-packages`.

You can, however, declare multiple workspace packages directories. Personally, I
prefer to use `["packages/*", "apps/*", "services/*"]`. It is only the structure
inside them that should be flat.

## Installation

Run `pnpm install isolate-package -D` or the equivalent for `npm`, `bun`, or
`yarn`.

## Usage

::: warning
If you plan to use this for Firebase deployments, and you want to preserve live
code updates when running the local emulators, you will want to use
[firebase-tools-with-isolate](https://github.com/0x80/firebase-tools-with-isolate)
instead.
:::

This package exposes a binary called `isolate`.

Run `npx isolate` from the root of the package you want to isolate. Make sure
you build the package first.

The `isolate` binary will try to infer your build output location from a
`tsconfig` file, but see the [buildDirName configuration](/configuration#builddirname)
if you are not using TypeScript.

By default the isolated output will become available at `./isolate`.

All [configuration options](/configuration) can also be set via
[CLI flags](/cli-reference), which take precedence over the config file.

If you are here to improve your Firebase deployments check out the
[Firebase quick start guide](/deploying-to-firebase#quick-start).

## Quickstart

Run `npx isolate-package isolate` from the monorepo package you would like to
isolate.

If you would like to see an example of a modern monorepo with this tool
integrated, check out [typescript-monorepo](https://github.com/0x80/typescript-monorepo).
