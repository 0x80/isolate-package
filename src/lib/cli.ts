import type { IsolateConfig } from "./config";
import type { LogLevel } from "./logger";
import { filterObjectUndefined } from "./utils/filter-object-undefined";

const validLogLevels: readonly LogLevel[] = ["info", "debug", "warn", "error"];

/**
 * Check if a boolean flag was explicitly passed on the command line. meow
 * returns `false` for unset boolean flags, making it impossible to distinguish
 * "not passed" from "explicitly set to false" via `--no-<flag>`.
 */
export function wasFlagExplicitlyPassed(
  flagName: string,
  argv: string[],
  shortFlag?: string
): boolean {
  const kebab = flagName.replace(/[A-Z]/g, (l) => `-${l.toLowerCase()}`);
  return argv.some(
    (arg) =>
      arg === `--${kebab}` ||
      arg === `--no-${kebab}` ||
      (shortFlag !== undefined && arg === `-${shortFlag}`)
  );
}

/**
 * Validate a log level string against the allowed values. Returns undefined if
 * the input is undefined, throws if the value is not a valid log level.
 */
export function parseLogLevel(value: string | undefined): LogLevel | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!validLogLevels.includes(value as LogLevel)) {
    throw new Error(
      `Invalid log level: "${value}". Must be one of: ${validLogLevels.join(", ")}`
    );
  }

  return value as LogLevel;
}

/** The parsed flags shape that meow produces for our flag definitions. */
export type ParsedFlags = {
  buildDirName: string | undefined;
  includeDevDependencies: boolean | undefined;
  isolateDirName: string | undefined;
  logLevel: string | undefined;
  targetPackagePath: string | undefined;
  tsconfigPath: string | undefined;
  workspacePackages: string[] | undefined;
  workspaceRoot: string | undefined;
  forceNpm: boolean | undefined;
  pickFromScripts: string[] | undefined;
  omitFromScripts: string[] | undefined;
  omitPackageManager: boolean | undefined;
};

/**
 * Build CLI overrides from parsed meow flags. Only includes values that were
 * actually provided by the user, so they can cleanly override config file
 * values via spread.
 */
export function buildCliOverrides(
  flags: ParsedFlags,
  argv: string[]
): IsolateConfig {
  const logLevel = parseLogLevel(flags.logLevel);

  return filterObjectUndefined({
    buildDirName: flags.buildDirName,
    isolateDirName: flags.isolateDirName,
    logLevel,
    targetPackagePath: flags.targetPackagePath,
    tsconfigPath: flags.tsconfigPath,
    workspaceRoot: flags.workspaceRoot,
    workspacePackages: flags.workspacePackages?.length
      ? flags.workspacePackages
      : undefined,
    pickFromScripts: flags.pickFromScripts?.length
      ? flags.pickFromScripts
      : undefined,
    omitFromScripts: flags.omitFromScripts?.length
      ? flags.omitFromScripts
      : undefined,
    ...(wasFlagExplicitlyPassed("forceNpm", argv) && {
      forceNpm: flags.forceNpm,
    }),
    ...(wasFlagExplicitlyPassed("includeDevDependencies", argv, "d") && {
      includeDevDependencies: flags.includeDevDependencies,
    }),
    ...(wasFlagExplicitlyPassed("omitPackageManager", argv) && {
      omitPackageManager: flags.omitPackageManager,
    }),
  }) as IsolateConfig;
}
