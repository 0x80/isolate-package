export const supportedPackageManagerNames = ["pnpm", "yarn", "npm"] as const;

export type PackageManagerName = (typeof supportedPackageManagerNames)[number];

export type PackageManager = {
  name: PackageManagerName;
  version: string;
};

export function getLockfileFileName(name: PackageManagerName) {
  switch (name) {
    case "pnpm":
      return "pnpm-lock.yaml";
    case "yarn":
      return "yarn.lock";
    case "npm":
      return "package-lock.json";
  }
}
