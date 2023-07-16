import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  /**
   * The `isolate` binary is an ES module. It is required to have the `.mjs`
   * file extension, otherwise a non-ESM workspace will try to load it as
   * commonJS. For details on this read [this article from Alex
   * Rauschmayer](https://exploringjs.com/nodejs-shell-scripting/ch_creating-shell-scripts.html#node.*
   * js-esm-modules-as-standalone-shell-scripts-on-unix)
   */
  outExtension() {
    return {
      js: `.mjs`,
    };
  },
  target: "esnext",
  sourcemap: true,
  dts: true,
  clean: true,
});
