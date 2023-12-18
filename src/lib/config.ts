import fs from "fs-extra";
import assert from "node:assert";
import path from "node:path";
import { isEmpty } from "ramda";
import { setLogLevel, useLogger } from "./logger";
import { inspectValue, readTypedJsonSync } from "./utils";

export type IsolateConfigResolved = {
  buildDirName?: string;
  includeDevDependencies: boolean;
  isolateDirName: string;
  logLevel: "info" | "debug" | "warn" | "error";
  targetPackagePath?: string;
  tsconfigPath: string;
  workspacePackages?: string[];
  workspaceRoot: string;
  forceNpm: boolean;
  pickFromScripts?: string[];
  omitFromScripts?: string[];
};

export type IsolateConfig = Partial<IsolateConfigResolved>;

const configDefaults: IsolateConfigResolved = {
  buildDirName: undefined,
  includeDevDependencies: false,
  isolateDirName: "isolate",
  logLevel: "info",
  targetPackagePath: undefined,
  tsconfigPath: "./tsconfig.json",
  workspacePackages: undefined,
  workspaceRoot: "../..",
  forceNpm: false,
  pickFromScripts: undefined,
  omitFromScripts: undefined,
};

/**
 * Only initialize the configuration once, and keeping it here for subsequent
 * calls to getConfig.
 */
let _resolvedConfig: IsolateConfigResolved | undefined;

let _user_defined_config: IsolateConfig | undefined;

const validConfigKeys = Object.keys(configDefaults);

const CONFIG_FILE_NAME = "isolate.config.json";

export type LogLevel = IsolateConfigResolved["logLevel"];

export function setUserConfig(config: IsolateConfig) {
  _user_defined_config = config;

  if (config.logLevel) {
    setLogLevel(config.logLevel);
  }
}

export function useConfig() {
  if (_resolvedConfig) {
    return _resolvedConfig;
  } else {
    throw new Error("Called useConfig before config was made available");
  }
}

/**
 * Resolve configuration based on user config and defaults. If setConfig was
 * called before this, it does not attempt to read a config file from disk.
 */
export function resolveConfig(): IsolateConfigResolved {
  if (_resolvedConfig) {
    return _resolvedConfig;
  }

  setLogLevel(process.env.DEBUG_ISOLATE_CONFIG ? "debug" : "info");

  const log = useLogger();

  const configFilePath = path.join(process.cwd(), CONFIG_FILE_NAME);

  if (_user_defined_config) {
    log.debug(`Using user defined config:`, inspectValue(_user_defined_config));
  } else {
    log.debug(`Attempting to load config from ${configFilePath}`);

    _user_defined_config = fs.existsSync(configFilePath)
      ? readTypedJsonSync<IsolateConfig>(configFilePath)
      : {};
  }

  const foreignKeys = Object.keys(_user_defined_config).filter(
    (key) => !validConfigKeys.includes(key)
  );

  if (!isEmpty(foreignKeys)) {
    log.warn(`Found invalid config settings:`, foreignKeys.join(", "));
  }

  const config = Object.assign(
    {},
    configDefaults,
    _user_defined_config
  ) satisfies IsolateConfigResolved;

  log.debug("Using configuration:", inspectValue(config));

  _resolvedConfig = config;
  return config;
}

/**
 * Get only the configuration that the user set explicitly in the config file or
 * passed via arguments to isolate().
 */
export function getUserDefinedConfig(): IsolateConfig {
  assert(
    _user_defined_config,
    "Called getUserDefinedConfig before user config was made available"
  );

  return _user_defined_config;
}
