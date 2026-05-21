import fs from "fs-extra";
import stripJsonComments from "strip-json-comments";
import { getErrorMessage } from "./get-error-message";

/** @todo Pass in zod schema and validate */
export function readTypedJsonSync(filePath: string): unknown {
  try {
    const rawContent = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(
      stripJsonComments(rawContent, { trailingCommas: true }),
    ) as unknown;
  } catch (error) {
    throw new Error(
      `Failed to read JSON from ${filePath}: ${getErrorMessage(error)}`,
      { cause: error },
    );
  }
}

export async function readTypedJson(filePath: string): Promise<unknown> {
  try {
    const rawContent = await fs.readFile(filePath, "utf-8");
    return JSON.parse(
      stripJsonComments(rawContent, { trailingCommas: true }),
    ) as unknown;
  } catch (error) {
    throw new Error(
      `Failed to read JSON from ${filePath}: ${getErrorMessage(error)}`,
      { cause: error },
    );
  }
}
