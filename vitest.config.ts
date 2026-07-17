import path from "node:path";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    /** Exclude nested git worktrees so we don't run another branch's tests */
    exclude: [...configDefaults.exclude, "**/.worktrees/**"],
    setupFiles: ["./src/testing/setup.ts"],
  },
  resolve: {
    alias: {
      "~": path.resolve(__dirname, "./src"),
    },
  },
});
