import { inspect } from "node:util";
import type { JsonValue } from "type-fest";

export function inspectValue(value: JsonValue) {
  return inspect(value, false, 16, true);
}
