import { join } from "node:path";

export function getRootRelativePath(path: string, rootPath: string) {
  const strippedPath = path.replace(rootPath, "");

  return join("(root)", strippedPath);
}

export function getIsolateRelativePath(path: string, isolatePath: string) {
  const strippedPath = path.replace(isolatePath, "");

  return join("(isolate)", strippedPath);
}
