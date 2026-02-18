#!/usr/bin/env node
import console from "node:console";
import meow from "meow";
import { outdent } from "outdent";
import sourceMaps from "source-map-support";
import { isolate } from "./isolate";
import { buildCliOverrides } from "./lib/cli";
import { loadConfigFromFile } from "./lib/config";

sourceMaps.install();

const cli = meow(
  outdent`
    Isolate a monorepo workspace package into a self-contained directory.

    Usage
      $ isolate [options]

    Options
      -b, --build-dir-name <name>            Build output directory name
      -d, --include-dev-dependencies         Include devDependencies in the isolated package
      -o, --isolate-dir-name <name>          Name of the isolate output directory (default: isolate)
      -l, --log-level <level>                Log level: info, debug, warn, error (default: info)
      -t, --target-package-path <path>       Path to the target package
      -c, --tsconfig-path <path>             Path to tsconfig.json (default: ./tsconfig.json)
      -w, --workspace-packages <glob>        Workspace package globs (repeatable)
      -r, --workspace-root <path>            Path to the workspace root (default: ../..)
          --force-npm                        Force npm lockfile generation
      -p, --pick-from-scripts <name>         Scripts to include (repeatable)
          --omit-from-scripts <name>         Scripts to exclude (repeatable)
          --omit-package-manager             Omit the packageManager field from the manifest

    Examples
      $ isolate --log-level debug
      $ isolate --force-npm --workspace-root ../..
      $ isolate --pick-from-scripts build --pick-from-scripts start
  `,
  {
    importMeta: import.meta,
    flags: {
      buildDirName: {
        type: "string",
        shortFlag: "b",
      },
      includeDevDependencies: {
        type: "boolean",
        shortFlag: "d",
      },
      isolateDirName: {
        type: "string",
        shortFlag: "o",
      },
      logLevel: {
        type: "string",
        shortFlag: "l",
      },
      targetPackagePath: {
        type: "string",
        shortFlag: "t",
      },
      tsconfigPath: {
        type: "string",
        shortFlag: "c",
      },
      workspacePackages: {
        type: "string",
        shortFlag: "w",
        isMultiple: true,
      },
      workspaceRoot: {
        type: "string",
        shortFlag: "r",
      },
      forceNpm: {
        type: "boolean",
      },
      pickFromScripts: {
        type: "string",
        shortFlag: "p",
        isMultiple: true,
      },
      omitFromScripts: {
        type: "string",
        isMultiple: true,
      },
      omitPackageManager: {
        type: "boolean",
      },
    },
  },
);

async function run() {
  const cliOverrides = buildCliOverrides(cli.flags, process.argv);
  const fileConfig = loadConfigFromFile();
  const mergedConfig = { ...fileConfig, ...cliOverrides };
  await isolate(mergedConfig);
}

run().catch((err) => {
  if (err instanceof Error) {
    console.error(err.stack);
    process.exit(1);
  } else {
    console.error(err);
  }
});
