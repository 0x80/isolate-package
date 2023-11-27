import { defineBuildConfig } from "unbuild";

export default defineBuildConfig({
  entries: ["./src/index", "./src/isolate-bin"],
  declaration: true,
});
