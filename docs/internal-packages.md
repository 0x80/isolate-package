# Internal Packages

An alternative approach to using internal dependencies in a Typescript monorepo
is
[the internal packages strategy](https://turbo.build/blog/you-might-not-need-typescript-project-references),
in which the package manifest entries point directly to Typescript source files,
to omit intermediate build steps. The approach is compatible with
isolate-package and showcased in
[my example monorepo setup](https://github.com/0x80/mono-ts).

## How It Works

1. The package to be deployed lists its internal dependencies as usual, but the
   package manifests of those dependencies point directly to the Typescript
   source (and types).
2. You configure the bundler of your target package to include the source code
   for those internal packages in its output bundle. In the case of TSUP, you
   can use [`getInternalPackageNames`](/api#getinternalpackagenames) for this:
   `noExternal: await getInternalPackageNames()`
3. When `isolate` runs, it does the same thing as always. It detects the
   internal packages, copies them to the isolate output folder and adjusts any
   links.
4. When deploying to Firebase, the cloud pipeline will treat the package
   manifest as usual, which installs the listed dependencies and any
   dependencies listed in the linked internal package manifests.

Steps 3 and 4 are no different from a traditional setup.

Note that the manifests for the internal packages in the output will still point
to the Typescript source files, but since the shared code was embedded in the
bundle, they will never be referenced via import statements. So the manifest
entry declarations are never used. The reason the packages are included in the
isolated output is to instruct the package manager to install their
dependencies.
