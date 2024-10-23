import Config from "@npmcli/config";
import defaults from "@npmcli/config/lib/definitions/index.js";

export async function loadNpmConfig({ npmPath }: { npmPath: string }) {
  const config = new Config({
    npmPath,
    definitions: defaults.definitions,
    shorthands: defaults.shorthands,
    flatten: defaults.flatten,
  });

  await config.load();

  return config;
}
