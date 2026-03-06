import * as nodePath from "node:path";

export function normalize(p: string): string {
  if (!p || p === "/") return "/";
  // Ensure leading slash, resolve . and .., remove trailing slash
  const resolved = nodePath.posix.resolve("/", p);
  return resolved === "" ? "/" : resolved;
}

export function parentPath(p: string): string {
  const norm = normalize(p);
  if (norm === "/") return "/";
  const parent = nodePath.posix.dirname(norm);
  return parent === "" ? "/" : parent;
}

export function baseName(p: string): string {
  const norm = normalize(p);
  if (norm === "/") return "/";
  return nodePath.posix.basename(norm);
}

export function allAncestors(p: string): string[] {
  const ancestors: string[] = [];
  let current = parentPath(p);
  while (current !== "/" && !ancestors.includes(current)) {
    ancestors.push(current);
    current = parentPath(current);
  }
  if (!ancestors.includes("/")) {
    ancestors.push("/");
  }
  return ancestors.reverse();
}

export function globToLike(pattern: string): string {
  // Convert glob pattern to SQL LIKE pattern
  // * -> %, ? -> _, escape % and _ literals
  let like = pattern;
  like = like.replace(/%/g, "\\%");
  like = like.replace(/_/g, "\\_");
  like = like.replace(/\*\*/g, "\x00"); // placeholder for **
  like = like.replace(/\*/g, "%");
  like = like.replace(/\?/g, "_");
  like = like.replace(/\x00/g, "%"); // ** also becomes %
  return like;
}

export function isChildPath(child: string, parent: string): boolean {
  const normChild = normalize(child);
  const normParent = normalize(parent);
  if (normParent === "/") return true;
  return normChild.startsWith(normParent + "/") || normChild === normParent;
}
