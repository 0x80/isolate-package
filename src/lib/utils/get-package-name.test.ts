import { describe, expect, it } from "vitest";
import { getPackageName } from "./get-package-name";

describe("getPackageName", () => {
  describe("scoped packages", () => {
    it("should extract name from scoped package with version", () => {
      expect(getPackageName("@firebase/app@1.2.3")).toBe("@firebase/app");
    });

    it("should extract name from scoped package with complex version", () => {
      expect(getPackageName("@types/node@20.10.0")).toBe("@types/node");
    });

    it("should handle scoped package without version", () => {
      expect(getPackageName("@firebase/app")).toBe("@firebase/app");
    });

    it("should handle malformed scoped package with extra slashes", () => {
      /** This is malformed input - real scoped packages only support @scope/name */
      expect(getPackageName("@org/sub/package@1.0.0")).toBe("@org/sub/package");
    });
  });

  describe("regular packages", () => {
    it("should extract name from regular package with version", () => {
      expect(getPackageName("lodash@4.17.21")).toBe("lodash");
    });

    it("should extract name from regular package with complex version", () => {
      expect(getPackageName("typescript@5.3.0-beta")).toBe("typescript");
    });

    it("should handle regular package without version", () => {
      expect(getPackageName("lodash")).toBe("lodash");
    });

    it("should handle package with hyphenated name", () => {
      expect(getPackageName("fs-extra@11.0.0")).toBe("fs-extra");
    });

    it("should handle package with underscores", () => {
      expect(getPackageName("some_package@1.0.0")).toBe("some_package");
    });
  });

  describe("edge cases", () => {
    it("should return empty string for empty input", () => {
      expect(getPackageName("")).toBe("");
    });

    it("should handle @ symbol only", () => {
      expect(getPackageName("@")).toBe("@");
    });

    it("should handle scoped package with only scope", () => {
      expect(getPackageName("@scope/")).toBe("@scope/");
    });

    it("should handle multiple @ symbols in version (edge case)", () => {
      /** This is a malformed input but should not throw */
      expect(getPackageName("package@1.0.0@extra")).toBe("package");
    });

    it("should handle scoped package with multiple @ in version", () => {
      /** Scoped packages split on @ so this tests the behavior */
      expect(getPackageName("@scope/pkg@1.0.0@extra")).toBe("@scope/pkg");
    });
  });
});
