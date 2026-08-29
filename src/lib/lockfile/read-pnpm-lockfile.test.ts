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
  });

  it("returns the pnpm 9 lockfile for pnpm 9 and later", async () => {
    const lockfile = {
      lockfileVersion: "9.0",
      importers: {},
    };
    readWantedLockfile_v9.mockResolvedValue(lockfile);

    const result = await readPnpmLockfile("/workspace", 12);

    expect(result).toBe(lockfile);
  });

  it("propagates lockfile read failures", async () => {
    const readError = new Error("invalid lockfile");
    readWantedLockfile_v9.mockRejectedValue(readError);

    await expect(readPnpmLockfile("/workspace", 11)).rejects.toBe(readError);
  });
});
