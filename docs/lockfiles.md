# Lockfiles

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

For version 1 of Yarn it appears that we can simply copy the original lockfile
to the isolate output, and run a `yarn install` to update that lockfile. The
command will still find the installed node modules in the root of the monorepo.

This is likely to break down if you configure the isolate output to be outside
of the tree of your monorepo.

## Modern Yarn

For yarn v4 and up I have yet to find a solution. It does not want to run its
install in the isolate directory because that is not declared to be a package of
the monorepo.
