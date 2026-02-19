# Isolate Package

Isolate a monorepo workspace package into a self-contained directory with all
internal dependencies and an adapted lockfile.

## Features

- Self-contained output with all internal dependencies included
- Deterministic lockfile generation for the isolated package
- Works with NPM, PNPM, Yarn (classic and modern), and partial Bun support
- Zero-config for the vast majority of use cases
- Recursive dependency resolution
- Compatible with Firebase Functions (1st and 2nd generation)
- Automatic PNPM patched dependencies support

## Quick Start

```sh
npx isolate-package isolate
```

Run the command from the monorepo package you would like to isolate.

## Documentation

For full documentation visit
[isolate-package.codecompose.dev](https://isolate-package.codecompose.dev/). See
also:
[Comparison with pnpm deploy](https://isolate-package.codecompose.dev/comparison).

## License

MIT
