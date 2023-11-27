import chalk from "chalk";
import type { IsolateConfigResolved, LogLevel } from "../helpers/config";
/**
 * The Logger defines an interface that can be used to pass in a different
 * logger object in order to intercept all the logging output. We keep the
 * handlers separate from the logger object itself, so that we can change the
 * handlers but do not bother the user with having to handle logLevel.
 */
export type Logger = {
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
};

let _loggerHandlers: Logger = {
  debug(...args: unknown[]) {
    console.log(chalk.blue("debug"), ...args);
  },
  info(...args: unknown[]) {
    console.log(chalk.green("info"), ...args);
  },
  warn(...args: unknown[]) {
    console.log(chalk.yellow("warning"), ...args);
  },
  error(...args: unknown[]) {
    console.log(chalk.red("error"), ...args);
  },
};

const _logger: Logger = {
  debug(...args: unknown[]) {
    if (_logLevel === "debug") {
      _loggerHandlers.debug(...args);
    }
  },
  info(...args: unknown[]) {
    if (_logLevel === "debug" || _logLevel === "info") {
      _loggerHandlers.info(...args);
    }
  },
  warn(...args: unknown[]) {
    if (_logLevel === "debug" || _logLevel === "info" || _logLevel === "warn") {
      _loggerHandlers.warn(...args);
    }
  },
  error(...args: unknown[]) {
    _loggerHandlers.error(...args);
  },
};

let _logLevel: LogLevel = "info";

export function setLogger(logger: Logger) {
  _loggerHandlers = logger;
  return _logger;
}

export function setLogLevel(
  logLevel: IsolateConfigResolved["logLevel"]
): Logger {
  _logLevel = logLevel;
  return _logger;
}

export function useLogger() {
  return _logger;
}
