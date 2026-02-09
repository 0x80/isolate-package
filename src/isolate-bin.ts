#!/usr/bin/env node
import console from "node:console";
import meow from "meow";
import { outdent } from "outdent";
import sourceMaps from "source-map-support";
import { isolate } from "./isolate";
import type { IsolateConfig } from "./lib/config";
import { loadConfigFromFile } from "./lib/config";
import type { LogLevel } from "./lib/logger";
import { filterObjectUndefined } from "./lib/utils/filter-object-undefined";

sourceMaps.install();

const validLogLevels: LogLevel[] = ["info", "debug", "warn", "error"];

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
  }
);

/**
 * Check if a boolean flag was explicitly passed on the command line. meow
 * returns `false` for unset boolean flags, making it impossible to distinguish
 * "not passed" from "explicitly set to false" via `--no-<flag>`.
 */
function wasFlagExplicitlyPassed(flagName: string): boolean {
  const kebab = flagName.replace(/[A-Z]/g, (l) => `-${l.toLowerCase()}`);
  return process.argv.some(
    (arg) => arg === `--${kebab}` || arg === `--no-${kebab}`
  );
}

/** Validate the --log-level value against the allowed levels. */
function validateLogLevel(value: string | undefined): LogLevel | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!validLogLevels.includes(value as LogLevel)) {
    console.error(
      `Invalid log level: "${value}". Must be one of: ${validLogLevels.join(", ")}`
    );
    process.exit(1);
  }

  return value as LogLevel;
}

const validatedLogLevel = validateLogLevel(cli.flags.logLevel);

const cliOverrides: IsolateConfig = filterObjectUndefined({
  buildDirName: cli.flags.buildDirName,
  isolateDirName: cli.flags.isolateDirName,
  logLevel: validatedLogLevel,
  targetPackagePath: cli.flags.targetPackagePath,
  tsconfigPath: cli.flags.tsconfigPath,
  workspaceRoot: cli.flags.workspaceRoot,
  workspacePackages: cli.flags.workspacePackages?.length
    ? cli.flags.workspacePackages
    : undefined,
  pickFromScripts: cli.flags.pickFromScripts?.length
    ? cli.flags.pickFromScripts
    : undefined,
  omitFromScripts: cli.flags.omitFromScripts?.length
    ? cli.flags.omitFromScripts
    : undefined,
  ...(wasFlagExplicitlyPassed("forceNpm") && {
    forceNpm: cli.flags.forceNpm,
  }),
  ...(wasFlagExplicitlyPassed("includeDevDependencies") && {
    includeDevDependencies: cli.flags.includeDevDependencies,
  }),
  ...(wasFlagExplicitlyPassed("omitPackageManager") && {
    omitPackageManager: cli.flags.omitPackageManager,
  }),
}) as IsolateConfig;

const fileConfig = loadConfigFromFile();
const mergedConfig = { ...fileConfig, ...cliOverrides };

async function run() {
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
