import type { isolate } from "./isolate";
export { isolate } from "./isolate";
export type { Logger } from "./lib/logger";

export type IsolateExports = {
  isolate: typeof isolate;
};
