# Lockfiles

The isolate process tries to generate an isolated / pruned lockfile for the
package manager that you use in your monorepo. If the package manager is not
supported (modern Yarn versions), it can still generate a matching NPM lockfile
based on the installed versions in node_modules.

In case your package manager is not supported by your deployment target you can
also choose NPM to be used by setting the `makeNpmLockfile` to `true` in your
configuration.

## NPM

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

## PNPM

@todo This is somewhat of a long story.

## Classic Yarn

For version 1 of Yarn we can simply copy the original lockfile to the isolate
output, and run a `yarn install` to update that lockfile. The command will still
find the installed node modules in the root of the monorepo.

> Note: I expect this to break down if you configure the isolate output
> directory to be located outside the monorepo tree.

## Modern Yarn

For modern Yarn versions we fall back to using NPM for the output lockfile.
Based on the installed node_modules we can generate an NPM lockfile that matches
the versions in the Yarn lockfile. It probably does not matter what package
manager your deployed code uses, as long as the versions match your original
lockfile.
