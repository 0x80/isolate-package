export function getRelativePath(path: string, relativeTo: string) {
  return path.replace(relativeTo, "");
}
