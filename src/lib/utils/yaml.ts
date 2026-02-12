import fs from "fs-extra";
import yaml from "yaml";
import { getErrorMessage } from "./get-error-message";

export function readTypedYamlSync<T>(filePath: string) {
  try {
    const rawContent = fs.readFileSync(filePath, "utf-8");
    const data = yaml.parse(rawContent);
    /** @todo Add some zod validation maybe */
    return data as T;
  } catch (err) {
    throw new Error(
      `Failed to read YAML from ${filePath}: ${getErrorMessage(err)}`,
      { cause: err }
    );
  }
}

export function writeTypedYamlSync<T>(filePath: string, content: T) {
  /** @todo Add some zod validation maybe */
  fs.writeFileSync(filePath, yaml.stringify(content), "utf-8");
}
