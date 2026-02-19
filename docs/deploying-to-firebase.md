# Deploying to Firebase

::: tip
There is
[a fork of firebase-tools](https://github.com/0x80/firebase-tools-with-isolate),
where isolate-package is integrated.
:::

## Motivation

This solution was born from a desire to deploy to
[Firebase](https://firebase.google.com/) from a monorepo without resorting to
custom shell scripts and other hacks. Here is
[an article](https://thijs-koerselman.medium.com/deploy-to-firebase-without-the-hacks-e685de39025e)
explaining the issue in more detail.

There is nothing Firebase-specific to this solution and there should be other
use-cases for it, but that is why this documentation contains some instructions
related to Firebase.

## Example

If you are not completely confident that your monorepo setup is solid, I advise
you to check out my in-depth boilerplate at
[typescript-monorepo](https://github.com/0x80/typescript-monorepo) where many different aspects are
discussed and `isolate-package` is used to demonstrate Firebase deployments.

## Quick Start

This section describes the steps required for Firebase deployment, assuming:

- You use a fairly typical monorepo setup
- Your `firebase.json` config lives in the root of the package that you like to
  deploy to Firebase, hereafter referred to as the "target package".

If your setup diverges from a traditional one, please continue reading the
[prerequisites](/getting-started#prerequisites) section.

1. In the target package, install `isolate-package` and `firebase-tools` by
   running `pnpm add isolate-package firebase-tools -D` or the Yarn / NPM
   equivalent. I tend to install firebase-tools as a devDependency in every
   Firebase package, but you could also use a global install if you prefer that.
2. In the `firebase.json` config set `"source"` to `"./isolate"` and
   `"predeploy"` to `["turbo build", "isolate"]` or whatever suits your build
   tool. The important part here is that isolate is being executed after the
   build stage.
3. From the target package folder, you should now be able to deploy with
   `npx firebase deploy`.

I recommend keeping a `firebase.json` file inside each Firebase package (as
opposed to the monorepo root), because it allows you to deploy from multiple
independent packages. It makes it easy to deploy 1st gen functions next to 2nd
gen functions, deploy different node versions, and decrease the built output
size and dependency lists for each package, improving deployment and cold-start
times.

## Firebase Tools With Isolate

I recommend using
[the fork](https://github.com/0x80/firebase-tools-with-isolate) for monorepos
until it is officially integrated. It not only simplifies the setup but more
importantly allows `isolate` to run as an integral part of the deployment
process, so it doesn't affect anything prior to deployment. Because of this, you
preserve live code updates when running the local Firebase emulators, which I
think is highly desirable.

The fork is pretty much identical, and the integration with isolate-package does
not affect any existing functionality, so I do not think there is a reason to
worry about things breaking. I will sync the fork with the upstream
firebase-tools on a regular basis. The fork versions will match the
firebase-tools versions for clarity.

## Deploying from Multiple Packages

You can deploy to Firebase from multiple packages in your monorepo, in which
case you co-locate your `firebase.json` file with the source code, and not in
the root of the monorepo. If you do want to keep the firebase config in the
root, read the instructions for
[deploying from the root](#deploying-from-the-root).

In order to deploy to Firebase, the `functions.source` setting in
`firebase.json` needs to point to the isolated output folder, which would be
`./isolate` when using the default configuration.

The `predeploy` phase should first build and then isolate the output.

Here's an example using [Turborepo](https://turbo.build/):

```jsonc
// firebase.json
{
  "functions": {
    "source": "./isolate",
    "predeploy": ["turbo build", "isolate"],
  },
}
```

With this configuration you can then run `npx firebase deploy --only functions`
from the package.

If you like to deploy to Firebase Functions from multiple packages you will also
need to configure a unique `codebase` identifier for each of them. For more
information,
[read this](https://firebase.google.com/docs/functions/beta/organize-functions).

Make sure your Firebase package adheres to the things mentioned in
[prerequisites](/getting-started#prerequisites) and its package manifest
contains the field `"main"`, or `"module"` if you set `"type": "module"`, so
Firebase knows the entry point to your source code.

## Deploying from the Root

If, for some reason, you choose to keep the `firebase.json` file in the root of
the monorepo you will have to place a configuration file called
`isolate.config.json` in the root with the following content:

```jsonc
// isolate.config.json
{
  "targetPackagePath": "./packages/your-firebase-package",
}
```

The Firebase configuration should then look something like this:

```jsonc
// firebase.json
{
  "functions": {
    "source": "./packages/your-firebase-package/isolate",
    "predeploy": ["turbo build", "isolate"],
  },
}
```
