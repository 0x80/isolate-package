import { defineConfig } from "tsup";
/**
 * TSUP doesn't seem to generate js files for cjs anymore if we map js to mjs,
 * so we need to use two different configs and build twice.
 */
export default defineConfig({
  entry: {
    index: "src/index.ts",
  },
  format: ["cjs"],
  target: "node18",
  sourcemap: true,
  splitting: false,
  shims: true, // replaces use of import.meta
});
