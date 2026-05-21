import fs from "fs-extra";
import yaml from "yaml";
import { getErrorMessage } from "./get-error-message";

/** @todo Add some zod validation maybe */
export function readTypedYamlSync(filePath: string): unknown {
  try {
    const rawContent = fs.readFileSync(filePath, "utf-8");
    return yaml.parse(rawContent) as unknown;
  } catch (error) {
    throw new Error(
      `Failed to read YAML from ${filePath}: ${getErrorMessage(error)}`,
      { cause: error },
    );
  }
}

/** @todo Add some zod validation maybe */
export function writeTypedYamlSync(filePath: string, content: unknown) {
  fs.writeFileSync(filePath, yaml.stringify(content), "utf-8");
}
