export function getMajorVersion(version: string) {
  return parseInt(version.split(".")[0], 10);
}
