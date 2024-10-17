import Config from "@npmcli/config";
import defaults from "@npmcli/config/lib/definitions/index.js";

export async function loadNpmConfig({ npmPath }: { npmPath: string }) {
  const conf = new Config({
    npmPath,
    definitions: defaults.definitions,
    shorthands: defaults.shorthands,
    flatten: defaults.flatten,
  });

  await conf.load();

  return conf;
}
