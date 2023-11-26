import fs from "fs-extra";
// can't use because ESM and firebase-tools build to CJS
// import stripJsonComments from "strip-json-comments";
import { getErrorMessage } from "./get-error-message";

/** @todo Pass in zod schema and validate */
export function readTypedJsonSync<T>(filePath: string) {
  try {
    const rawContent = fs.readFileSync(filePath, "utf-8");
    // const data = JSON.parse(stripJsonComments(rawContent)) as T;
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
