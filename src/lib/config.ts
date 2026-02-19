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
const CONFIG_FILE_NAME_JS = "isolate.config.js";
const CONFIG_FILE_NAME_JSON = "isolate.config.json";

/**
 * Load a JS or TS config file by spawning a Node subprocess. For TS files,
 * --experimental-strip-types is added so Node can handle TypeScript natively.
 * This keeps the function synchronous while allowing us to import the module.
 */
const CONFIG_JSON_DELIMITER = "__ISOLATE_CONFIG_JSON__";

function loadModuleConfig(filePath: string): IsolateConfig {
  const fileUrl = pathToFileURL(filePath).href;
  const isTypeScript = filePath.endsWith(".ts");
  const script = `import(process.argv[1])
    .then(m => {
      if (m.default === undefined) {
        process.stderr.write("Config file has no default export");
        process.exit(1);
      }
      process.stdout.write("${CONFIG_JSON_DELIMITER}" + JSON.stringify(m.default) + "${CONFIG_JSON_DELIMITER}");
    })
    .catch(err => {
      process.stderr.write(String(err));
      process.exit(1);
    })`;

  try {
    const result = execFileSync(
      process.execPath,
      [
        ...(isTypeScript ? ["--experimental-strip-types"] : []),
        "--no-warnings",
        "--input-type=module",
        "-e",
        script,
        fileUrl,
      ],
      { encoding: "utf8" },
    );

    const jsonMatch = result.split(CONFIG_JSON_DELIMITER)[1];

    if (jsonMatch === undefined) {
      throw new Error("Failed to extract config JSON from subprocess output");
    }

    const parsed = JSON.parse(jsonMatch);

    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      throw new Error(
        `Expected default export to be an object, got ${typeof parsed}`,
      );
    }

    return parsed;
  } catch (error) {
    const stderr =
      error instanceof Error && "stderr" in error
        ? String(error.stderr).trim()
        : "";
    const detail = stderr || (error instanceof Error ? error.message : "");
    throw new Error(
      `Failed to load config from ${filePath}${detail ? `: ${detail}` : ""}`,
      { cause: error },
    );
  }
}

export function loadConfigFromFile(): IsolateConfig {
  const log = useLogger();
  const cwd = process.cwd();
  const tsConfigPath = path.join(cwd, CONFIG_FILE_NAME_TS);
  const jsConfigPath = path.join(cwd, CONFIG_FILE_NAME_JS);
  const jsonConfigPath = path.join(cwd, CONFIG_FILE_NAME_JSON);

  const tsExists = fs.existsSync(tsConfigPath);
  const jsExists = fs.existsSync(jsConfigPath);
  const jsonExists = fs.existsSync(jsonConfigPath);

  const existingFiles = [
    tsExists && CONFIG_FILE_NAME_TS,
    jsExists && CONFIG_FILE_NAME_JS,
    jsonExists && CONFIG_FILE_NAME_JSON,
  ].filter(Boolean);

  if (existingFiles.length > 1) {
    log.warn(
      `Found multiple config files: ${existingFiles.join(", ")}. Using ${existingFiles[0]}.`,
    );
  }

  if (tsExists) {
    return loadModuleConfig(tsConfigPath);
  }

  if (jsExists) {
    return loadModuleConfig(jsConfigPath);
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
