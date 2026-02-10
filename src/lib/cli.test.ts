import { describe, expect, it } from "vitest";
import {
  type ParsedFlags,
  buildCliOverrides,
  parseLogLevel,
  wasFlagExplicitlyPassed,
} from "./cli";

/** Default flags as meow returns them when nothing is passed. */
const defaultFlags: ParsedFlags = {
  buildDirName: undefined,
  includeDevDependencies: false,
  isolateDirName: undefined,
  logLevel: undefined,
  targetPackagePath: undefined,
  tsconfigPath: undefined,
  workspacePackages: undefined,
  workspaceRoot: undefined,
  forceNpm: false,
  pickFromScripts: undefined,
  omitFromScripts: undefined,
  omitPackageManager: false,
};

describe("wasFlagExplicitlyPassed", () => {
  it("detects a long flag", () => {
    const argv = ["node", "isolate", "--force-npm"];
    expect(wasFlagExplicitlyPassed("forceNpm", argv)).toBe(true);
  });

  it("detects a --no- negation flag", () => {
    const argv = ["node", "isolate", "--no-force-npm"];
    expect(wasFlagExplicitlyPassed("forceNpm", argv)).toBe(true);
  });

  it("detects a short flag", () => {
    const argv = ["node", "isolate", "-d"];
    expect(wasFlagExplicitlyPassed("includeDevDependencies", argv, "d")).toBe(
      true
    );
  });

  it("returns false when the flag is not present", () => {
    const argv = ["node", "isolate", "--log-level", "debug"];
    expect(wasFlagExplicitlyPassed("forceNpm", argv)).toBe(false);
  });

  it("returns false for a short flag when no shortFlag is configured", () => {
    const argv = ["node", "isolate", "-d"];
    expect(wasFlagExplicitlyPassed("includeDevDependencies", argv)).toBe(false);
  });

  it("handles multi-word camelCase flag names", () => {
    const argv = ["node", "isolate", "--omit-package-manager"];
    expect(wasFlagExplicitlyPassed("omitPackageManager", argv)).toBe(true);
  });
});

describe("parseLogLevel", () => {
  it("returns undefined for undefined input", () => {
    expect(parseLogLevel(undefined)).toBeUndefined();
  });

  it("returns a valid log level", () => {
    expect(parseLogLevel("debug")).toBe("debug");
    expect(parseLogLevel("info")).toBe("info");
    expect(parseLogLevel("warn")).toBe("warn");
    expect(parseLogLevel("error")).toBe("error");
  });

  it("throws for an invalid log level", () => {
    expect(() => parseLogLevel("verbose")).toThrow(
      'Invalid log level: "verbose"'
    );
  });
});

describe("buildCliOverrides", () => {
  it("returns an empty object when no flags are passed", () => {
    const argv = ["node", "isolate"];
    const overrides = buildCliOverrides(defaultFlags, argv);
    expect(overrides).toEqual({});
  });

  it("includes string flags that are set", () => {
    const flags: ParsedFlags = {
      ...defaultFlags,
      buildDirName: "build",
      workspaceRoot: "../../..",
    };
    const argv = [
      "node",
      "isolate",
      "--build-dir-name",
      "build",
      "-r",
      "../../..",
    ];
    const overrides = buildCliOverrides(flags, argv);
    expect(overrides.buildDirName).toBe("build");
    expect(overrides.workspaceRoot).toBe("../../..");
  });

  it("omits empty array flags", () => {
    const flags: ParsedFlags = {
      ...defaultFlags,
      workspacePackages: [],
      pickFromScripts: [],
      omitFromScripts: [],
    };
    const argv = ["node", "isolate"];
    const overrides = buildCliOverrides(flags, argv);
    expect(overrides.workspacePackages).toBeUndefined();
    expect(overrides.pickFromScripts).toBeUndefined();
    expect(overrides.omitFromScripts).toBeUndefined();
  });

  it("includes non-empty array flags", () => {
    const flags: ParsedFlags = {
      ...defaultFlags,
      pickFromScripts: ["build", "start"],
    };
    const argv = [
      "node",
      "isolate",
      "--pick-from-scripts",
      "build",
      "--pick-from-scripts",
      "start",
    ];
    const overrides = buildCliOverrides(flags, argv);
    expect(overrides.pickFromScripts).toEqual(["build", "start"]);
  });

  it("omits boolean flags that were not explicitly passed", () => {
    const argv = ["node", "isolate"];
    const overrides = buildCliOverrides(defaultFlags, argv);
    expect(overrides).not.toHaveProperty("forceNpm");
    expect(overrides).not.toHaveProperty("includeDevDependencies");
    expect(overrides).not.toHaveProperty("omitPackageManager");
  });

  it("includes a boolean flag when passed via long flag", () => {
    const flags: ParsedFlags = { ...defaultFlags, forceNpm: true };
    const argv = ["node", "isolate", "--force-npm"];
    const overrides = buildCliOverrides(flags, argv);
    expect(overrides.forceNpm).toBe(true);
  });

  it("includes a boolean flag when negated via --no-", () => {
    const flags: ParsedFlags = { ...defaultFlags, forceNpm: false };
    const argv = ["node", "isolate", "--no-force-npm"];
    const overrides = buildCliOverrides(flags, argv);
    expect(overrides.forceNpm).toBe(false);
  });

  it("includes a boolean flag when passed via short flag -d", () => {
    const flags: ParsedFlags = {
      ...defaultFlags,
      includeDevDependencies: true,
    };
    const argv = ["node", "isolate", "-d"];
    const overrides = buildCliOverrides(flags, argv);
    expect(overrides.includeDevDependencies).toBe(true);
  });

  it("validates an invalid log level", () => {
    const flags: ParsedFlags = { ...defaultFlags, logLevel: "verbose" };
    const argv = ["node", "isolate", "--log-level", "verbose"];
    expect(() => buildCliOverrides(flags, argv)).toThrow(
      'Invalid log level: "verbose"'
    );
  });

  describe("precedence: config file values are overridden by CLI flags", () => {
    it("CLI string flags override config file", () => {
      const fileConfig = {
        isolateDirName: "output",
        logLevel: "info" as const,
      };
      const flags: ParsedFlags = {
        ...defaultFlags,
        isolateDirName: "custom-isolate",
        logLevel: "debug",
      };
      const argv = [
        "node",
        "isolate",
        "--isolate-dir-name",
        "custom-isolate",
        "--log-level",
        "debug",
      ];
      const cliOverrides = buildCliOverrides(flags, argv);
      const merged = { ...fileConfig, ...cliOverrides };
      expect(merged.isolateDirName).toBe("custom-isolate");
      expect(merged.logLevel).toBe("debug");
    });

    it("CLI boolean flags override config file true values", () => {
      const fileConfig = { forceNpm: true };
      const flags: ParsedFlags = { ...defaultFlags, forceNpm: false };
      const argv = ["node", "isolate", "--no-force-npm"];
      const cliOverrides = buildCliOverrides(flags, argv);
      const merged = { ...fileConfig, ...cliOverrides };
      expect(merged.forceNpm).toBe(false);
    });

    it("config file boolean values are preserved when CLI flag is not passed", () => {
      const fileConfig = { forceNpm: true };
      const flags: ParsedFlags = { ...defaultFlags, forceNpm: false };
      const argv = ["node", "isolate"];
      const cliOverrides = buildCliOverrides(flags, argv);
      const merged = { ...fileConfig, ...cliOverrides };
      expect(merged.forceNpm).toBe(true);
    });

    it("CLI array flags override config file arrays", () => {
      const fileConfig = { pickFromScripts: ["test"] };
      const flags: ParsedFlags = {
        ...defaultFlags,
        pickFromScripts: ["build", "start"],
      };
      const argv = [
        "node",
        "isolate",
        "--pick-from-scripts",
        "build",
        "--pick-from-scripts",
        "start",
      ];
      const cliOverrides = buildCliOverrides(flags, argv);
      const merged = { ...fileConfig, ...cliOverrides };
      expect(merged.pickFromScripts).toEqual(["build", "start"]);
    });
  });
});
