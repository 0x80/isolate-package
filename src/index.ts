import type { isolate } from "./isolate";
export { isolate } from "./isolate";
export { getInternalPackageNames } from "./get-internal-package-names";
export { defineConfig } from "./lib/config";
export type { IsolateConfig } from "./lib/config";
export type { Logger } from "./lib/logger";

export type IsolateExports = {
  isolate: typeof isolate;
};
