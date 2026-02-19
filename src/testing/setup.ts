import { vi } from "vitest";

/** Mock the logger for all tests to prevent console output during tests */
vi.mock("~/lib/logger", () => ({
  useLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
  setLogLevel: vi.fn(),
  setLogger: vi.fn(),
}));
