import chalk from "chalk";
import { IsolateConfigResolved } from "~/helpers";

export function createLogger(logLevel: IsolateConfigResolved["logLevel"]) {
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
