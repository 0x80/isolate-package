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

const lockfileFileNamesByPackageManager: Record<PackageManagerName, string> = {
  bun: "bun.lock",
  pnpm: "pnpm-lock.yaml",
  yarn: "yarn.lock",
  npm: "package-lock.json",
};

export function getLockfileFileName(name: PackageManagerName) {
  return lockfileFileNamesByPackageManager[name];
}
