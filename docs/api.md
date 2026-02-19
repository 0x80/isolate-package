# API

The `isolate` process can be integrated in other programs by importing it as a
function. You optionally pass it some user configuration and possibly a logger to
handle any output messages should you need to write them to a different location
than the standard `node:console`.

## isolate()

```ts
import { isolate } from "isolate-package";

await isolate({
  config: { logLevel: "debug" },
  logger: customLogger,
});
```

If no configuration is passed in, the process will try to read from
`isolate.config.{ts,js,json}` in the current working directory.

## getInternalPackageNames()

Returns the list of internal workspace packages that the target package depends
on. This is useful for tools like tsup that need to know which packages to
bundle rather than treat as external.

```ts
import { getInternalPackageNames } from "isolate-package";

const packageNames = await getInternalPackageNames();
```

It reads from `isolate.config.{ts,js,json}` in the current working directory,
or you can pass a configuration object directly:

```ts
const packageNames = await getInternalPackageNames({
  workspaceRoot: "../..",
});
```

For example, in a tsup config:

```ts
import { defineConfig } from "tsup";
import { getInternalPackageNames } from "isolate-package";

export default defineConfig(async () => ({
  noExternal: await getInternalPackageNames(),
}));
```

## defineConfig()

A helper for type-checked configuration files. Use it in `isolate.config.ts` or
`isolate.config.js`:

```ts
import { defineConfig } from "isolate-package";

export default defineConfig({
  workspaceRoot: "../..",
});
```
