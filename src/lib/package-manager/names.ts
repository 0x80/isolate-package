export const supportedPackageManagerNames = [
  "pnpm",
  "yarn",
  "npm",
  "bun",
] as const;

export type PackageManagerName = (typeof supportedPackageManagerNames)[number];

export type PackageManager = {
  name: PackageManagerName;
  version: string;
  majorVersion: number;
  packageManagerString?: string;
};

export function getLockfileFileName(name: PackageManagerName) {
  switch (name) {
    case "bun":
      return "bun.lock";
    case "pnpm":
      return "pnpm-lock.yaml";
    case "yarn":
      return "yarn.lock";
    case "npm":
      return "package-lock.json";
  }
}
