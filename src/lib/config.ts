import fs from "fs-extra";
import path from "node:path";
import { isEmpty } from "remeda";
import { type LogLevel, setLogLevel, useLogger } from "./logger";
import { inspectValue, readTypedJsonSync } from "./utils";

export type IsolateConfigResolved = {
  buildDirName?: string;
  includeDevDependencies: boolean;
  isolateDirName: string;
  logLevel: LogLevel;
  targetPackagePath?: string;
  tsconfigPath: string;
  workspacePackages?: string[];
  workspaceRoot: string;
  forceNpm: boolean;
  pickFromScripts?: string[];
  omitFromScripts?: string[];
  omitPackageManager?: boolean;
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
  omitPackageManager: false,
};

const validConfigKeys = Object.keys(configDefaults);
const CONFIG_FILE_NAME = "isolate.config.json";

export function loadConfigFromFile(): IsolateConfig {
  const configFilePath = path.join(process.cwd(), CONFIG_FILE_NAME);
  return fs.existsSync(configFilePath)
    ? readTypedJsonSync<IsolateConfig>(configFilePath)
    : {};
}

function validateConfig(config: IsolateConfig) {
  const log = useLogger();
  const foreignKeys = Object.keys(config).filter(
    (key) => !validConfigKeys.includes(key)
  );

  if (!isEmpty(foreignKeys)) {
    log.warn(`Found invalid config settings:`, foreignKeys.join(", "));
  }
}

export function resolveConfig(
  initialConfig?: IsolateConfig
): IsolateConfigResolved {
  setLogLevel(process.env.DEBUG_ISOLATE_CONFIG ? "debug" : "info");
  const log = useLogger();

  const userConfig = initialConfig ?? loadConfigFromFile();

  if (initialConfig) {
    log.debug(`Using user defined config:`, inspectValue(initialConfig));
  } else {
    log.debug(`Loaded config from ${CONFIG_FILE_NAME}`);
  }

  validateConfig(userConfig);

  if (userConfig.logLevel) {
    setLogLevel(userConfig.logLevel);
  }

  const config = {
    ...configDefaults,
    ...userConfig,
  } satisfies IsolateConfigResolved;

  log.debug("Using configuration:", inspectValue(config));

  return config;
}
