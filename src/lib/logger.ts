import { createConsola, type ConsolaInstance } from "consola";

export type LogLevel = "info" | "debug" | "warn" | "error";

/**
 * The Logger defines an interface that can be used to pass in a different
 * logger object in order to intercept all the logging output.
 */
export type Logger = {
  debug(message: unknown, ...args: unknown[]): void;
  info(message: unknown, ...args: unknown[]): void;
  warn(message: unknown, ...args: unknown[]): void;
  error(message: unknown, ...args: unknown[]): void;
};

/**
 * Map our log levels to consola's numeric levels. Consola levels:
 * 0=fatal/error, 1=warn, 2=log, 3=info, 4=debug, 5=trace
 */
const logLevelMap: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 3,
  debug: 4,
};

const _consola: ConsolaInstance = createConsola({
  level: logLevelMap["info"],
});

let _customLogger: Logger | null = null;

function createMethod(method: keyof Logger) {
  return (message: unknown, ...args: unknown[]) => {
    const target = _customLogger ?? _consola;
    target[method](message, ...args);
  };
}

const _logger: Logger = {
  debug: createMethod("debug"),
  info: createMethod("info"),
  warn: createMethod("warn"),
  error: createMethod("error"),
};

export function setLogger(logger: Logger) {
  _customLogger = logger;
  return _logger;
}

export function setLogLevel(logLevel: LogLevel): Logger {
  _consola.level = logLevelMap[logLevel];
  return _logger;
}

export function useLogger() {
  return _logger;
}
