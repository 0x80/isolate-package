import { describe, expect, it } from "vitest";
import { filterObjectUndefined } from "./filter-object-undefined";

describe("filterObjectUndefined", () => {
  it("should filter out undefined values", () => {
    expect(
      filterObjectUndefined({
        a: "a",
        b: undefined,
        c: "c",
      }),
    ).toEqual({
      a: "a",
      c: "c",
    });
  });
});
