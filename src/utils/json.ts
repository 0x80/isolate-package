import fs from "fs-extra";

/**
 * @TODO pass in zod schema and validate
 */
export function readTypedJsonSync<T>(filePath: string) {
  const rawContent = fs.readFileSync(filePath, "utf-8");
  const data = JSON.parse(rawContent) as T;
  return data;
}

export async function readTypedJson<T>(filePath: string) {
  const rawContent = await fs.readFile(filePath, "utf-8");
  const data = JSON.parse(rawContent) as T;
  return data;
}
