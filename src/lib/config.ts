import { execFileSync } from "node:child_process";
import fs from "fs-extra";
import path from "node:path";
import { pathToFileURL } from "node:url";
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
const CONFIG_FILE_NAME_TS = "isolate.config.ts";
const CONFIG_FILE_NAME_JSON = "isolate.config.json";

/**
 * Load a TypeScript config file by spawning a Node subprocess with
 * --experimental-strip-types. This keeps the function synchronous while
 * allowing us to import the TS module.
 */
function loadTsConfig(filePath: string): IsolateConfig {
  const fileUrl = pathToFileURL(filePath).href;
  const script = `import(process.argv[1])
    .then(m => process.stdout.write(JSON.stringify(m.default)))`;

  const result = execFileSync(
    process.execPath,
    [
      "--experimental-strip-types",
      "--no-warnings",
      "--input-type=module",
      "-e",
      script,
      fileUrl,
    ],
    { encoding: "utf8" },
  );

  return JSON.parse(result);
}

export function loadConfigFromFile(): IsolateConfig {
  const log = useLogger();
  const tsConfigPath = path.join(process.cwd(), CONFIG_FILE_NAME_TS);
  const jsonConfigPath = path.join(process.cwd(), CONFIG_FILE_NAME_JSON);

  const tsExists = fs.existsSync(tsConfigPath);
  const jsonExists = fs.existsSync(jsonConfigPath);

  if (tsExists && jsonExists) {
    log.warn(
      `Found both ${CONFIG_FILE_NAME_TS} and ${CONFIG_FILE_NAME_JSON}. Using ${CONFIG_FILE_NAME_TS}.`,
    );
  }

  if (tsExists) {
    return loadTsConfig(tsConfigPath);
  }

  if (jsonExists) {
    return readTypedJsonSync<IsolateConfig>(jsonConfigPath);
  }

  return {};
}

/** Helper for type-safe configuration in isolate.config.ts files. */
export function defineConfig(config: IsolateConfig): IsolateConfig {
  return config;
}

function validateConfig(config: IsolateConfig) {
  const log = useLogger();
  const foreignKeys = Object.keys(config).filter(
    (key) => !validConfigKeys.includes(key),
  );

  if (!isEmpty(foreignKeys)) {
    log.warn(`Found invalid config settings:`, foreignKeys.join(", "));
  }
}

export function resolveConfig(
  initialConfig?: IsolateConfig,
): IsolateConfigResolved {
  setLogLevel(process.env.DEBUG_ISOLATE_CONFIG ? "debug" : "info");
  const log = useLogger();

  const userConfig = initialConfig ?? loadConfigFromFile();

  if (initialConfig) {
    log.debug(`Using user defined config:`, inspectValue(initialConfig));
  } else {
    log.debug(`Loaded config from file`);
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
