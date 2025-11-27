export function getMajorVersion(version: string) {
  return parseInt(version.split(".").at(0) ?? "0", 10);
}
