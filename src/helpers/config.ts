import { isEmpty } from "lodash-es";
import path from "node:path";
import { createLogger, inspectValue, readTypedJsonSync } from "~/utils";

export type IsolateConfigResolved = {
  logLevel: "info" | "debug" | "warn" | "error";
  workspaceRoot: string;
  workspacePackages?: string[];
  isolateOutDir: string;
  includeDevDependencies: boolean;
  tsconfigPath: string;
  buildOutputDir?: string;
};

export type IsolateConfig = Partial<IsolateConfigResolved>;

const configDefaults: IsolateConfigResolved = {
  logLevel: "info",
  workspaceRoot: "../..",
  isolateOutDir: "./isolate",
  includeDevDependencies: false,
  tsconfigPath: "./tsconfig.json",
  workspacePackages: undefined,
  buildOutputDir: undefined,
};

/**
 * Only initialize the configuration once, and keeping it here for subsequent
 * calls to getConfig.
 */
let __config: IsolateConfigResolved | undefined;

const validConfigKeys = Object.keys(configDefaults);

const CONFIG_FILE_NAME = "isolate.config.json";

type LogLevel = IsolateConfigResolved["logLevel"];

export function getConfig(): IsolateConfigResolved {
  if (__config) {
    return __config;
  }

  /**
   * Since the logLevel is set via config we can't use it to determine if we
   * should output verbose logging as part of the config loading process. Using
   * the env var ISOLATE_CONFIG_LOG_LEVEL you have the option to log debug
   * output.
   */
  const log = createLogger(
    (process.env.ISOLATE_CONFIG_LOG_LEVEL as LogLevel) ?? "warn",
  );

  const configFilePath = path.join(process.cwd(), CONFIG_FILE_NAME);

  log.debug(`Attempting to load config from ${configFilePath}`);

  const configFromFile = readTypedJsonSync<IsolateConfig>(
    path.join(process.cwd(), CONFIG_FILE_NAME),
  );

  const foreignKeys = Object.keys(configFromFile).filter(
    (key) => !validConfigKeys.includes(key),
  );

  if (!isEmpty(foreignKeys)) {
    log.warn(`Found invalid config settings:`, foreignKeys.join(", "));
  }

  const config = Object.assign(
    {},
    configDefaults,
    configFromFile,
  ) satisfies IsolateConfigResolved;

  log.debug("Using configuration:", inspectValue(config));

  __config = config;
  return config;
}
