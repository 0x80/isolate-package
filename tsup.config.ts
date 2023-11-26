import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "isolate-bin": "src/isolate-bin.ts",
  },
  format: ["esm"],
  target: "node18",
  sourcemap: true,
  dts: true,
  clean: true,
  /**
   * The `isolate` binary is an ES module, because it also imports from other ES
   * modules. For the binary is required to have the `.mjs` file extension,
   * otherwise a non-ESM workspace will try to execute it as commonJS.
   *
   * For details see [this article from Alex
   * Rauschmayer](https://exploringjs.com/nodejs-shell-scripting/ch_creating-shell-scripts.html#node.*
   * js-esm-modules-as-standalone-shell-scripts-on-unix)
   */
  outExtension() {
    return {
      js: `.mjs`,
    };
  },
});
