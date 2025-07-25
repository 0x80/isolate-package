import { describe, expect, it, vi } from "vitest";
import { validateManifestMandatoryFields } from "./validate-manifest";
import type { PackageManifest } from "../types";

/** Mock the logger to avoid console output during tests */
vi.mock("../logger", () => ({
  useLogger: () => ({
    debug: vi.fn(),
    error: vi.fn(),
  }),
}));

describe("validateManifestMandatoryFields", () => {
  const packagePath = "packages/test-package";

  it("should pass validation when all mandatory fields are present", () => {
    const validManifest: PackageManifest = {
      name: "test-package",
      version: "1.0.0",
      files: ["dist"],
    };

    expect(() =>
      validateManifestMandatoryFields(validManifest, packagePath)
    ).not.toThrow();
  });

  it("should throw error when version field is missing", () => {
    const invalidManifest = {
      name: "test-package",
      files: ["dist"],
    } as PackageManifest;

    expect(() =>
      validateManifestMandatoryFields(invalidManifest, packagePath)
    ).toThrow(/missing mandatory fields: version/);
  });

  it("should throw error when files field is missing", () => {
    const invalidManifest = {
      name: "test-package",
      version: "1.0.0",
    } as PackageManifest;

    expect(() =>
      validateManifestMandatoryFields(invalidManifest, packagePath)
    ).toThrow(/missing mandatory fields: files/);
  });

  it("should throw error when files field is empty array", () => {
    const invalidManifest: PackageManifest = {
      name: "test-package",
      version: "1.0.0",
      files: [],
    };

    expect(() =>
      validateManifestMandatoryFields(invalidManifest, packagePath)
    ).toThrow(/missing mandatory fields: files/);
  });

  it("should throw error when files field is not an array", () => {
    const invalidManifest: PackageManifest = {
      name: "test-package",
      version: "1.0.0",
      files: "dist" as unknown as string[],
    };

    expect(() =>
      validateManifestMandatoryFields(invalidManifest, packagePath)
    ).toThrow(/missing mandatory fields: files/);
  });

  it("should throw error when both fields are missing", () => {
    const invalidManifest = {
      name: "test-package",
    } as PackageManifest;

    expect(() =>
      validateManifestMandatoryFields(invalidManifest, packagePath)
    ).toThrow(/missing mandatory fields: version, files/);
  });

  it("should include helpful error message", () => {
    const invalidManifest = {
      name: "test-package",
    } as PackageManifest;

    expect(() =>
      validateManifestMandatoryFields(invalidManifest, packagePath)
    ).toThrow(/The "version" field is required for pack to execute/);

    expect(() =>
      validateManifestMandatoryFields(invalidManifest, packagePath)
    ).toThrow(
      /the "files" field is required to declare what files should be included/
    );
  });
});
