import fs from "fs-extra";
import yaml from "yaml";
import { getErrorMessage } from "./get-error-message";

export function readTypedYamlSync<T>(filePath: string) {
  try {
    const rawContent = fs.readFileSync(filePath, "utf-8");
    const data = yaml.parse(rawContent);
    /**
     * @TODO add some zod validation maybe
     */
    return data as T;
  } catch (err) {
    throw new Error(
      `Failed to read YAML from ${filePath}: ${getErrorMessage(err)}`
    );
  }
}

export function writeTypedYamlSync<T>(filePath: string, content: T) {
  /**
   * @TODO add some zod validation maybe
   */
  fs.writeFileSync(filePath, yaml.stringify(content), "utf-8");
}
