import fs from "fs-extra";
import yaml from "yaml";

export function readTypedYamlSync<T>(filePath: string) {
  const rawContent = fs.readFileSync(filePath, "utf-8");
  const data = yaml.parse(rawContent);
  /**
   * @TODO add some zod validation maybe
   */
  return data as T;
}
