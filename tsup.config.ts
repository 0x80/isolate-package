import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  /**
   * We need an mjs extension.
   * See https://exploringjs.com/nodejs-shell-scripting/ch_creating-shell-scripts.html#node.js-esm-modules-as-standalone-shell-scripts-on-unix
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
