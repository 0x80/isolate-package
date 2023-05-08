import { inspect } from "node:util";
import { JsonValue } from "type-fest";

export function inspectValue(value: JsonValue) {
  return inspect(value, false, 4, true);
}
