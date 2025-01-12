import { join } from "node:path";

export function getRootRelativeLogPath(path: string, rootPath: string) {
  const strippedPath = path.replace(rootPath, "");

  return join("(root)", strippedPath);
}

export function getIsolateRelativeLogPath(path: string, isolatePath: string) {
  const strippedPath = path.replace(isolatePath, "");

  return join("(isolate)", strippedPath);
}
