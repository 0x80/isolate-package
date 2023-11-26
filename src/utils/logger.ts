import chalk from "chalk";
import type { IsolateConfigResolved } from "~/helpers/config";

export type Logger = {
  debug(...args: any[]): void;
  info(...args: any[]): void;
  warn(...args: any[]): void;
  error(...args: any[]): void;
};

export function createLogger(
  logLevel: IsolateConfigResolved["logLevel"]
): Logger {
  return {
    debug(...args: any[]) {
      if (logLevel === "debug") {
        console.log(chalk.blue("debug"), ...args);
      }
    },
    info(...args: any[]) {
      if (logLevel === "debug" || logLevel === "info") {
        console.log(chalk.green("info"), ...args);
      }
    },
    warn(...args: any[]) {
      if (logLevel === "debug" || logLevel === "info" || logLevel === "warn") {
        console.log(chalk.yellow("warning"), ...args);
      }
    },
    error(...args: any[]) {
      console.log(chalk.red("error"), ...args);
    },
  };
}
