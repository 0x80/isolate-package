import { inspect } from "node:util";

export function inspectValue(value: unknown) {
  return inspect(value, false, 16, true);
}
