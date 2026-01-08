/**
 * Extracts the package name from a package spec like "chalk@5.3.0" or
 * "@firebase/app@1.2.3"
 */
export function getPackageName(packageSpec: string): string {
  if (packageSpec.startsWith("@")) {
    /** Scoped packages: @scope/package@version -> @scope/package */
    const parts = packageSpec.split("@");
    return `@${parts[1] ?? ""}`;
  }
  /** Regular packages: package@version -> package */
  return packageSpec.split("@")[0] ?? "";
}
