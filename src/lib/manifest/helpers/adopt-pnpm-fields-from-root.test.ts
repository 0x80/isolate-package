import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { PackageManifest, ProjectManifest } from "@pnpm/types";
import { adoptPnpmFieldsFromRoot } from "./adopt-pnpm-fields-from-root";

/** Mock the dependencies */
vi.mock("~/lib/utils", () => ({
  isRushWorkspace: vi.fn(),
  readTypedJson: vi.fn(),
}));

const { isRushWorkspace, readTypedJson } = vi.mocked(await import("~/lib/utils"));

describe("adoptPnpmFieldsFromRoot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should return original manifest for Rush workspace", async () => {
    isRushWorkspace.mockReturnValue(true);
    const targetManifest: PackageManifest = {
      name: "test-package",
      version: "1.0.0",
    };

    const result = await adoptPnpmFieldsFromRoot(targetManifest, "/workspace");

    expect(result).toBe(targetManifest);
    expect(isRushWorkspace).toHaveBeenCalledWith("/workspace");
    expect(readTypedJson).not.toHaveBeenCalled();
  });

  it("should return original manifest when no pnpm fields are present", async () => {
    isRushWorkspace.mockReturnValue(false);
    readTypedJson.mockResolvedValue({
      name: "root",
      version: "1.0.0",
    } as ProjectManifest);

    const targetManifest: PackageManifest = {
      name: "test-package",
      version: "1.0.0",
    };

    const result = await adoptPnpmFieldsFromRoot(targetManifest, "/workspace");

    expect(result).toEqual(targetManifest);
  });

  it("should adopt only overrides when only overrides are present", async () => {
    isRushWorkspace.mockReturnValue(false);
    readTypedJson.mockResolvedValue({
      name: "root",
      version: "1.0.0",
      pnpm: {
        overrides: {
          "foo": "^1.0.0",
        },
      },
    } as ProjectManifest);

    const targetManifest: PackageManifest = {
      name: "test-package",
      version: "1.0.0",
    };

    const result = await adoptPnpmFieldsFromRoot(targetManifest, "/workspace");

    expect(result).toEqual({
      name: "test-package",
      version: "1.0.0",
      pnpm: {
        overrides: {
          "foo": "^1.0.0",
        },
      },
    });
  });

  it("should adopt only onlyBuiltDependencies when only onlyBuiltDependencies are present", async () => {
    isRushWorkspace.mockReturnValue(false);
    readTypedJson.mockResolvedValue({
      name: "root",
      version: "1.0.0",
      pnpm: {
        onlyBuiltDependencies: ["fsevents", "node-gyp"],
      },
    } as ProjectManifest);

    const targetManifest: PackageManifest = {
      name: "test-package",
      version: "1.0.0",
    };

    const result = await adoptPnpmFieldsFromRoot(targetManifest, "/workspace");

    expect(result).toEqual({
      name: "test-package",
      version: "1.0.0",
      pnpm: {
        onlyBuiltDependencies: ["fsevents", "node-gyp"],
      },
    });
  });

  it("should adopt only ignoredBuiltDependencies when only ignoredBuiltDependencies are present", async () => {
    isRushWorkspace.mockReturnValue(false);
    readTypedJson.mockResolvedValue({
      name: "root",
      version: "1.0.0",
      pnpm: {
        ignoredBuiltDependencies: ["puppeteer", "cypress"],
      },
    } as ProjectManifest);

    const targetManifest: PackageManifest = {
      name: "test-package",
      version: "1.0.0",
    };

    const result = await adoptPnpmFieldsFromRoot(targetManifest, "/workspace");

    expect(result).toEqual({
      name: "test-package",
      version: "1.0.0",
      pnpm: {
        ignoredBuiltDependencies: ["puppeteer", "cypress"],
      },
    });
  });

  it("should adopt all pnpm fields when all are present", async () => {
    isRushWorkspace.mockReturnValue(false);
    readTypedJson.mockResolvedValue({
      name: "root",
      version: "1.0.0",
      pnpm: {
        overrides: {
          "foo": "^1.0.0",
          "bar": "^2.0.0",
        },
        onlyBuiltDependencies: ["fsevents", "node-gyp"],
        ignoredBuiltDependencies: ["puppeteer", "cypress"],
      },
    } as ProjectManifest);

    const targetManifest: PackageManifest = {
      name: "test-package",
      version: "1.0.0",
    };

    const result = await adoptPnpmFieldsFromRoot(targetManifest, "/workspace");

    expect(result).toEqual({
      name: "test-package",
      version: "1.0.0",
      pnpm: {
        overrides: {
          "foo": "^1.0.0",
          "bar": "^2.0.0",
        },
        onlyBuiltDependencies: ["fsevents", "node-gyp"],
        ignoredBuiltDependencies: ["puppeteer", "cypress"],
      },
    });
  });

  it("should replace existing pnpm fields in target manifest", async () => {
    isRushWorkspace.mockReturnValue(false);
    readTypedJson.mockResolvedValue({
      name: "root",
      version: "1.0.0",
      pnpm: {
        overrides: {
          "foo": "^1.0.0",
        },
        onlyBuiltDependencies: ["fsevents"],
      },
    } as ProjectManifest);

    const targetManifest = {
      name: "test-package",
      version: "1.0.0",
      pnpm: {
        someOtherField: "value",
      },
    } as PackageManifest & { pnpm: any };

    const result = await adoptPnpmFieldsFromRoot(targetManifest, "/workspace");

    /** Note: the function should replace the entire pnpm object */
    expect(result).toEqual({
      name: "test-package",
      version: "1.0.0",
      pnpm: {
        overrides: {
          "foo": "^1.0.0",
        },
        onlyBuiltDependencies: ["fsevents"],
      },
    });
  });
});