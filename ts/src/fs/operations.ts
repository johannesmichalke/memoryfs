import { randomUUID } from "node:crypto";
import type { Database, NodeRow } from "../db/types.js";
import { normalize, parentPath, baseName, allAncestors, globToLike } from "./paths.js";
import {
  NotFoundError,
  IsDirectoryError,
  NotDirectoryError,
  EditConflictError,
  FileSizeError,
} from "./errors.js";

const DEFAULT_MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export interface FileSystemOptions {
  /** Maximum file size in bytes. Default: 10 MB. Set to Infinity to disable. */
  maxFileSize?: number;
}

export class FileSystem {
  private maxFileSize: number;

  constructor(
    private db: Database,
    private userId: string,
    options?: FileSystemOptions
  ) {
    this.maxFileSize = options?.maxFileSize ?? DEFAULT_MAX_FILE_SIZE;
  }

  async read(path: string, opts?: { offset?: number; limit?: number }): Promise<string> {
    const norm = normalize(path);
    const node = await this.db.getNode(this.userId, norm);
    if (!node) throw new NotFoundError(norm);
    if (node.is_dir) throw new IsDirectoryError(norm);
    const content = node.content ?? "";
    if (opts?.offset !== undefined || opts?.limit !== undefined) {
      const lines = content.split("\n");
      const start = (opts.offset ?? 1) - 1; // 1-based to 0-based
      const count = opts.limit ?? lines.length;
      return lines.slice(Math.max(0, start), start + count).join("\n");
    }
    return content;
  }

  async write(path: string, content: string): Promise<void> {
    const norm = normalize(path);
    const size = Buffer.byteLength(content, "utf-8");
    if (size > this.maxFileSize) throw new FileSizeError(size, this.maxFileSize);

    await this.ensureParents(norm);

    const existing = await this.db.getNode(this.userId, norm);
    if (existing && existing.is_dir) throw new IsDirectoryError(norm);
    const version = existing ? existing.version + 1 : 1;

    await this.db.upsertNode({
      id: existing?.id ?? randomUUID(),
      user_id: this.userId,
      path: norm,
      parent_path: parentPath(norm),
      name: baseName(norm),
      is_dir: false,
      content,
      version,
      size,
    });
  }

  async edit(path: string, oldString: string, newString: string): Promise<void> {
    const norm = normalize(path);
    const node = await this.db.getNode(this.userId, norm);
    if (!node) throw new NotFoundError(norm);
    if (node.is_dir) throw new IsDirectoryError(norm);

    const content = node.content ?? "";
    const occurrences = content.split(oldString).length - 1;

    if (occurrences === 0) {
      throw new EditConflictError(
        `old_string not found in ${norm}`
      );
    }
    if (occurrences > 1) {
      throw new EditConflictError(
        `old_string is not unique in ${norm} (found ${occurrences} occurrences)`
      );
    }

    const newContent = content.replace(oldString, newString);
    const newSize = Buffer.byteLength(newContent, "utf-8");
    if (newSize > this.maxFileSize) throw new FileSizeError(newSize, this.maxFileSize);

    await this.db.updateContent(
      this.userId,
      norm,
      newContent,
      newSize,
      node.version + 1
    );
  }

  async multiEdit(path: string, edits: Array<{ old_string: string; new_string: string }>): Promise<void> {
    const norm = normalize(path);
    const node = await this.db.getNode(this.userId, norm);
    if (!node) throw new NotFoundError(norm);
    if (node.is_dir) throw new IsDirectoryError(norm);

    let content = node.content ?? "";
    for (const edit of edits) {
      const occurrences = content.split(edit.old_string).length - 1;
      if (occurrences === 0) {
        throw new EditConflictError(`old_string not found in ${norm}: ${edit.old_string.slice(0, 40)}`);
      }
      if (occurrences > 1) {
        throw new EditConflictError(
          `old_string is not unique in ${norm} (found ${occurrences} occurrences): ${edit.old_string.slice(0, 40)}`
        );
      }
      content = content.replace(edit.old_string, edit.new_string);
    }

    const newSize = Buffer.byteLength(content, "utf-8");
    if (newSize > this.maxFileSize) throw new FileSizeError(newSize, this.maxFileSize);

    await this.db.updateContent(
      this.userId,
      norm,
      content,
      newSize,
      node.version + 1
    );
  }

  async ls(path: string, opts?: { recursive?: boolean }): Promise<Array<{ path: string; name: string; isDir: boolean; size: number }>> {
    const norm = normalize(path);

    // Root always exists
    if (norm !== "/") {
      const node = await this.db.getNode(this.userId, norm);
      if (!node) throw new NotFoundError(norm);
      if (!node.is_dir) throw new NotDirectoryError(norm);
    }

    if (opts?.recursive) {
      const descendants = await this.db.listDescendants(this.userId, norm);
      return descendants.map((c) => ({
        path: c.path,
        name: c.name,
        isDir: c.is_dir,
        size: c.size,
      }));
    }

    const children = await this.db.listChildren(this.userId, norm);
    return children.map((c) => ({
      path: c.path,
      name: c.name,
      isDir: c.is_dir,
      size: c.size,
    }));
  }

  async mkdir(path: string): Promise<void> {
    const norm = normalize(path);
    if (norm === "/") return;
    await this.ensureParents(norm);
    await this.ensureDir(norm);
  }

  async rm(path: string): Promise<void> {
    const norm = normalize(path);
    if (norm === "/") {
      throw new Error("Cannot remove root directory");
    }
    const node = await this.db.getNode(this.userId, norm);
    if (!node) throw new NotFoundError(norm);

    if (node.is_dir) {
      await this.db.deleteTree(this.userId, norm);
    } else {
      await this.db.deleteNode(this.userId, norm);
    }
  }

  async append(path: string, content: string): Promise<void> {
    const norm = normalize(path);
    const node = await this.db.getNode(this.userId, norm);
    if (!node) {
      // File doesn't exist — create it
      await this.write(norm, content);
      return;
    }
    if (node.is_dir) throw new IsDirectoryError(norm);
    const newContent = (node.content ?? "") + content;
    const newSize = Buffer.byteLength(newContent, "utf-8");
    if (newSize > this.maxFileSize) throw new FileSizeError(newSize, this.maxFileSize);

    await this.db.updateContent(
      this.userId,
      norm,
      newContent,
      newSize,
      node.version + 1
    );
  }

  async grep(
    pattern: string,
    path?: string,
    opts?: { case_insensitive?: boolean }
  ): Promise<Array<{ path: string; lines: Array<{ line: number; text: string }> }>> {
    if (pattern.length > 1000) {
      throw new Error("Regex pattern too long (max 1000 characters)");
    }

    const pathPrefix = path ? normalize(path) : undefined;

    // If pattern contains regex syntax, scan all files (DB can't pre-filter).
    // Only use LIKE hint when the pattern is plain literal text.
    const hasRegexSyntax = /[.*+?^${}()|[\]\\]/.test(pattern);
    const likeStr = hasRegexSyntax ? "%" : pattern;
    const candidates = await this.db.searchContent(
      this.userId,
      likeStr,
      pathPrefix
    );

    const flags = "gm" + (opts?.case_insensitive ? "i" : "");
    const regex = new RegExp(pattern, flags);
    const results: Array<{ path: string; lines: Array<{ line: number; text: string }> }> = [];

    for (const node of candidates) {
      if (!node.content) continue;
      const fileLines = node.content.split("\n");
      const matched: Array<{ line: number; text: string }> = [];
      for (let i = 0; i < fileLines.length; i++) {
        regex.lastIndex = 0;
        if (regex.test(fileLines[i])) {
          matched.push({ line: i + 1, text: fileLines[i] });
        }
      }
      if (matched.length > 0) {
        results.push({ path: node.path, lines: matched });
      }
    }

    return results;
  }

  async glob(
    pattern: string,
    path?: string,
    opts?: { type?: "file" | "dir" }
  ): Promise<string[]> {
    const pathPrefix = path ? normalize(path) : undefined;
    const likePattern = globToLike(pattern);
    let nodes = await this.db.searchNames(this.userId, likePattern, pathPrefix);
    if (opts?.type === "file") {
      nodes = nodes.filter((n) => !n.is_dir);
    } else if (opts?.type === "dir") {
      nodes = nodes.filter((n) => n.is_dir);
    }
    return nodes.map((n) => n.path);
  }

  async mv(from: string, to: string): Promise<void> {
    const normFrom = normalize(from);
    const normTo = normalize(to);

    const sourceNode = await this.db.getNode(this.userId, normFrom);
    if (!sourceNode) throw new NotFoundError(normFrom);

    // Check if destination is an existing directory — move into it
    const destNode = await this.db.getNode(this.userId, normTo);
    let finalTo = normTo;
    if (destNode && destNode.is_dir) {
      finalTo = normalize(normTo + "/" + baseName(normFrom));
    }

    // If target is an existing file, remove it first (overwrite like real mv)
    const finalTarget = await this.db.getNode(this.userId, finalTo);
    if (finalTarget && !finalTarget.is_dir) {
      await this.db.deleteNode(this.userId, finalTo);
    }

    await this.ensureParents(finalTo);

    // Move the node itself
    await this.db.moveNode(
      this.userId,
      normFrom,
      finalTo,
      parentPath(finalTo),
      baseName(finalTo)
    );

    // If it's a directory, move all descendants
    if (sourceNode.is_dir) {
      await this.db.moveTree(this.userId, normFrom, finalTo);
    }
  }

  private async ensureParents(path: string): Promise<void> {
    const ancestors = allAncestors(path);
    for (const anc of ancestors) {
      await this.ensureDir(anc);
    }
  }

  private async ensureDir(path: string): Promise<void> {
    if (path === "/") return; // root is virtual, never stored
    const existing = await this.db.getNode(this.userId, path);
    if (existing) {
      if (!existing.is_dir) {
        throw new NotDirectoryError(path);
      }
      return;
    }
    await this.db.upsertNode({
      id: randomUUID(),
      user_id: this.userId,
      path,
      parent_path: parentPath(path),
      name: baseName(path),
      is_dir: true,
      content: null,
      version: 1,
      size: 0,
    });
  }
}
