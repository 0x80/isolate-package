import { defineConfig } from "tsup";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { default: tsconfigPathsPlugin } = require("@esbuild-plugins/tsconfig-paths");

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "isolate-bin": "src/isolate-bin.ts",
  },
  format: ["esm"],
  target: "node18",
  sourcemap: true,
  splitting: false,
  dts: true,
  clean: true,
  esbuildPlugins: [tsconfigPathsPlugin({})],
  // shims: true, // replaces use of import.meta
  /**
   * The `isolate` binary is an ES module. The file is required to have the
   * `.mjs` file extension, otherwise a non-ESM workspace will try to execute it
   * as commonJS.
   *
   * For details see [this article from Alex
   * Rauschmayer](https://exploringjs.com/nodejs-shell-scripting/ch_creating-shell-scripts.html
   */
  outExtension() {
    return {
      js: `.mjs`,
    };
  },
});
