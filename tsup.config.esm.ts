import { defineConfig } from "tsup";
/**
 * TSUP doesn't seem to generate js files for cjs anymore if we map js to mjs,
 * so we need to use two different configs and build twice.
 *
 * ESM is built first, so we can use clean: true here.
 */
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
  /**
   * The `isolate` binary is an ES module. The file is required to have the
   * `.mjs` file extension, otherwise a non-ESM workspace will try to execute it
   * as commonJS.
   *
   * For details see [this article from Alex
   * Rauschmayer](https://exploringjs.com/nodejs-shell-scripting/ch_creating-shell-scripts.html
   *
   * Js-esm-modules-as-standalone-shell-scripts-on-unix)
   */
  outExtension() {
    return {
      js: `.mjs`,
    };
  },
});
