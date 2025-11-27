import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "isolate-bin": "src/isolate-bin.ts",
  },
  format: ["esm"],
  target: "node20",
  sourcemap: true,
  dts: true,
  clean: true,
  exports: true,
});
