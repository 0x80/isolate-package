import { fileURLToPath } from "url";

/**
 * Calling context should pass in import.meta.url and the function will return
 * the equivalent of __dirname in Node/CommonJs.
 */
export function getDirname(importMetaUrl: string) {
  return fileURLToPath(new URL(".", importMetaUrl));
}
