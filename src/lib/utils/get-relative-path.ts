export function getRootRelativePath(path: string, rootPath: string) {
  const strippedPath = path.replace(rootPath, "");

  return strippedPath.startsWith("/")
    ? `(root)${strippedPath}`
    : `(root)/${strippedPath}`;
}

export function getIsolateRelativePath(path: string, isolatePath: string) {
  const strippedPath = path.replace(isolatePath, "");

  return strippedPath.startsWith("/")
    ? `(isolate)${strippedPath}`
    : `(isolate)/${strippedPath}`;
}
