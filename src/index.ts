import type { detectMonorepo } from "./lib/detect-monorepo";
import type { isolate } from "./isolate";
export { isolate } from "./isolate";
export { detectMonorepo } from "./lib/detect-monorepo";
export type { MonorepoInfo } from "./lib/detect-monorepo";
export { getInternalPackageNames } from "./get-internal-package-names";
export { defineConfig } from "./lib/config";
export type { IsolateConfig } from "./lib/config";
export type { Logger } from "./lib/logger";

/** Used by firebase-tools-with-isolate to type the dynamic import */
export type IsolateExports = {
  isolate: typeof isolate;
  detectMonorepo: typeof detectMonorepo;
};
