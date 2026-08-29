import { beforeEach, describe, expect, it, vi } from "vitest";
import { readPnpmLockfile } from "./read-pnpm-lockfile";

vi.mock("pnpm_lockfile_file_v8", () => ({
  readWantedLockfile: vi.fn(),
}));

vi.mock("pnpm_lockfile_file_v9", () => ({
  readWantedLockfile: vi.fn(),
}));

const { readWantedLockfile: readWantedLockfile_v8 } = vi.mocked(
  await import("pnpm_lockfile_file_v8"),
);
const { readWantedLockfile: readWantedLockfile_v9 } = vi.mocked(
  await import("pnpm_lockfile_file_v9"),
);

describe("readPnpmLockfile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the pnpm 8 lockfile for versions before pnpm 9", async () => {
    const lockfile = {
      lockfileVersion: 6,
      importers: {},
    };
    readWantedLockfile_v8.mockResolvedValue(lockfile);

    const result = await readPnpmLockfile("/workspace", 8);

    expect(result).toBe(lockfile);
    expect(readWantedLockfile_v8).toHaveBeenCalledOnce();
    expect(readWantedLockfile_v8).toHaveBeenCalledWith("/workspace", {
      ignoreIncompatible: false,
    });
    expect(readWantedLockfile_v9).not.toHaveBeenCalled();
  });

  it("returns the pnpm 9 lockfile for pnpm 9 and later", async () => {
    const lockfile = {
      lockfileVersion: "9.0",
      importers: {},
    };
    readWantedLockfile_v9.mockResolvedValue(lockfile);

    const result = await readPnpmLockfile("/workspace", 12);

    expect(result).toBe(lockfile);
    expect(readWantedLockfile_v9).toHaveBeenCalledOnce();
    expect(readWantedLockfile_v9).toHaveBeenCalledWith("/workspace", {
      ignoreIncompatible: false,
    });
    expect(readWantedLockfile_v8).not.toHaveBeenCalled();
  });

  it.each([
    { majorVersion: 8, reader: readWantedLockfile_v8 },
    { majorVersion: 9, reader: readWantedLockfile_v9 },
  ])(
    "propagates pnpm $majorVersion lockfile read failures by default",
    async ({ majorVersion, reader }) => {
      const readError = new Error("invalid lockfile");
      reader.mockRejectedValue(readError);

      await expect(readPnpmLockfile("/workspace", majorVersion)).rejects.toBe(
        readError,
      );
    },
  );

  it("returns undefined when the caller selects the fallback policy", async () => {
    readWantedLockfile_v9.mockRejectedValue(new Error("invalid lockfile"));

    const result = await readPnpmLockfile("/workspace", 11, {
      onFailure: "return-undefined",
    });

    expect(result).toBeUndefined();
  });

  it("returns the read error when the caller needs to report it", async () => {
    const readError = new Error("invalid lockfile");
    readWantedLockfile_v9.mockRejectedValue(readError);

    const result = await readPnpmLockfile("/workspace", 11, {
      onFailure: "return-error",
    });

    expect(result).toEqual({ readError });
  });
});
