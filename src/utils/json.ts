import fs from "fs-extra";
import { getErrorMessage } from "./get-error-message";

/**
 * @TODO pass in zod schema and validate
 */
export function readTypedJsonSync<T>(filePath: string) {
  try {
    const rawContent = fs.readFileSync(filePath, "utf-8");
    const data = JSON.parse(rawContent) as T;
    return data;
  } catch (err) {
    throw new Error(
      `Failed to read JSON from ${filePath}: ${getErrorMessage(err)}`
    );
  }
}

export async function readTypedJson<T>(filePath: string) {
  try {
    const rawContent = await fs.readFile(filePath, "utf-8");
    const data = JSON.parse(rawContent) as T;
    return data;
  } catch (err) {
    throw new Error(
      `Failed to read JSON from ${filePath}: ${getErrorMessage(err)}`
    );
  }
}
