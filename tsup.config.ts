import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "isolate-bin": "src/isolate-bin.ts",
  },

  format: ["esm", "cjs"],
  target: "node18",
  sourcemap: true,
  dts: true,
  clean: true,
});
