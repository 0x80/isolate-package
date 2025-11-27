import { createConsola, type ConsolaInstance } from "consola";

export type LogLevel = "info" | "debug" | "warn" | "error";

/**
 * The Logger defines an interface that can be used to pass in a different
 * logger object in order to intercept all the logging output.
 */
export type Logger = {
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
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

let _consola: ConsolaInstance = createConsola({
  level: logLevelMap["info"],
});

let _customLogger: Logger | null = null;

const _logger: Logger = {
  debug(...args: unknown[]) {
    if (_customLogger) {
      _customLogger.debug(...args);
    } else {
      _consola.debug(...(args as [unknown, ...unknown[]]));
    }
  },
  info(...args: unknown[]) {
    if (_customLogger) {
      _customLogger.info(...args);
    } else {
      _consola.info(...(args as [unknown, ...unknown[]]));
    }
  },
  warn(...args: unknown[]) {
    if (_customLogger) {
      _customLogger.warn(...args);
    } else {
      _consola.warn(...(args as [unknown, ...unknown[]]));
    }
  },
  error(...args: unknown[]) {
    if (_customLogger) {
      _customLogger.error(...args);
    } else {
      _consola.error(...(args as [unknown, ...unknown[]]));
    }
  },
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
