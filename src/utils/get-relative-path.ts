export function getRelativePath(path: string, relativeTo: string) {
  const strippedPath = path.replace(relativeTo, "");

  return strippedPath.startsWith("/")
    ? `.${strippedPath}`
    : `./${strippedPath}`;
}
