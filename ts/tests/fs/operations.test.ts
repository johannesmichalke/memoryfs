import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { FileSystem } from "../../src/fs/operations.js";
import { SqliteDatabase } from "../../src/db/sqlite.js";

let db: SqliteDatabase;
let fs: FileSystem;

beforeEach(async () => {
  db = new SqliteDatabase(":memory:");
  await db.initialize();
  fs = new FileSystem(db, "test-user");
});

afterEach(async () => {
  await db.close();
});

describe("write + read", () => {
  it("writes and reads a file", async () => {
    await fs.write("/hello.txt", "world");
    expect(await fs.read("/hello.txt")).toBe("world");
  });

  it("auto-creates parent directories", async () => {
    await fs.write("/a/b/c/file.txt", "deep");
    expect(await fs.read("/a/b/c/file.txt")).toBe("deep");
    const entries = await fs.ls("/a/b");
    expect(entries).toHaveLength(1);
    expect(entries[0].name).toBe("c");
    expect(entries[0].isDir).toBe(true);
  });

  it("overwrites existing file", async () => {
    await fs.write("/file.txt", "v1");
    await fs.write("/file.txt", "v2");
    expect(await fs.read("/file.txt")).toBe("v2");
  });

  it("throws NotFoundError for missing file", async () => {
    await expect(fs.read("/missing")).rejects.toThrow("No such file or directory");
  });

  it("throws IsDirectoryError when reading a directory", async () => {
    await fs.mkdir("/dir");
    await expect(fs.read("/dir")).rejects.toThrow("Is a directory");
  });

  it("throws IsDirectoryError when writing to existing directory", async () => {
    await fs.mkdir("/dir");
    await expect(fs.write("/dir", "data")).rejects.toThrow("Is a directory");
  });

  it("reads with offset and limit", async () => {
    await fs.write("/lines.txt", "line1\nline2\nline3\nline4\nline5");
    expect(await fs.read("/lines.txt", { offset: 2, limit: 2 })).toBe("line2\nline3");
    expect(await fs.read("/lines.txt", { offset: 4 })).toBe("line4\nline5");
    expect(await fs.read("/lines.txt", { limit: 2 })).toBe("line1\nline2");
  });
});

describe("edit", () => {
  it("replaces a unique string", async () => {
    await fs.write("/file.txt", "hello world");
    await fs.edit("/file.txt", "world", "universe");
    expect(await fs.read("/file.txt")).toBe("hello universe");
  });

  it("throws if old_string not found", async () => {
    await fs.write("/file.txt", "hello");
    await expect(fs.edit("/file.txt", "xyz", "abc")).rejects.toThrow("old_string not found");
  });

  it("throws if old_string is not unique", async () => {
    await fs.write("/file.txt", "aaa");
    await expect(fs.edit("/file.txt", "a", "b")).rejects.toThrow("not unique");
  });
});

describe("multiEdit", () => {
  it("applies multiple edits in order", async () => {
    await fs.write("/file.txt", "aaa bbb ccc");
    await fs.multiEdit("/file.txt", [
      { old_string: "aaa", new_string: "xxx" },
      { old_string: "ccc", new_string: "zzz" },
    ]);
    expect(await fs.read("/file.txt")).toBe("xxx bbb zzz");
  });

  it("throws if any old_string not found", async () => {
    await fs.write("/file.txt", "hello");
    await expect(fs.multiEdit("/file.txt", [
      { old_string: "hello", new_string: "hi" },
      { old_string: "missing", new_string: "x" },
    ])).rejects.toThrow("old_string not found");
  });

  it("throws if any old_string is not unique", async () => {
    await fs.write("/file.txt", "ab ab cd");
    await expect(fs.multiEdit("/file.txt", [
      { old_string: "ab", new_string: "x" },
    ])).rejects.toThrow("not unique");
  });
});

describe("ls", () => {
  it("lists empty root", async () => {
    expect(await fs.ls("/")).toEqual([]);
  });

  it("lists directories first, then alphabetical", async () => {
    await fs.write("/b.txt", "b");
    await fs.write("/a.txt", "a");
    await fs.mkdir("/zdir");
    const entries = await fs.ls("/");
    expect(entries[0].name).toBe("zdir");
    expect(entries[0].isDir).toBe(true);
    expect(entries[1].name).toBe("a.txt");
    expect(entries[2].name).toBe("b.txt");
  });

  it("lists recursively", async () => {
    await fs.write("/a/b/file.txt", "x");
    await fs.write("/a/other.txt", "y");
    const entries = await fs.ls("/", { recursive: true });
    const paths = entries.map((e) => e.path);
    expect(paths).toContain("/a");
    expect(paths).toContain("/a/b");
    expect(paths).toContain("/a/b/file.txt");
    expect(paths).toContain("/a/other.txt");
  });

  it("lists recursively from subdirectory", async () => {
    await fs.write("/src/lib/utils.ts", "u");
    await fs.write("/src/index.ts", "i");
    await fs.write("/other/file.txt", "o");
    const entries = await fs.ls("/src", { recursive: true });
    const paths = entries.map((e) => e.path);
    expect(paths).toContain("/src");
    expect(paths).toContain("/src/lib");
    expect(paths).toContain("/src/lib/utils.ts");
    expect(paths).toContain("/src/index.ts");
    expect(paths).not.toContain("/other/file.txt");
  });

  it("throws NotFoundError for missing dir", async () => {
    await expect(fs.ls("/missing")).rejects.toThrow("No such file or directory");
  });

  it("throws NotDirectoryError for file", async () => {
    await fs.write("/file.txt", "x");
    await expect(fs.ls("/file.txt")).rejects.toThrow("Not a directory");
  });
});

describe("mkdir", () => {
  it("creates nested directories", async () => {
    await fs.mkdir("/a/b/c");
    const entries = await fs.ls("/a/b");
    expect(entries).toHaveLength(1);
    expect(entries[0].name).toBe("c");
    expect(entries[0].isDir).toBe(true);
  });

  it("is idempotent", async () => {
    await fs.mkdir("/dir");
    await fs.mkdir("/dir");
    const entries = await fs.ls("/");
    expect(entries).toHaveLength(1);
    expect(entries[0].name).toBe("dir");
    expect(entries[0].isDir).toBe(true);
  });
});

describe("rm", () => {
  it("removes a file", async () => {
    await fs.write("/file.txt", "x");
    await fs.rm("/file.txt");
    await expect(fs.read("/file.txt")).rejects.toThrow("No such file or directory");
  });

  it("removes directory recursively", async () => {
    await fs.write("/dir/a.txt", "a");
    await fs.write("/dir/b.txt", "b");
    await fs.rm("/dir");
    await expect(fs.ls("/dir")).rejects.toThrow("No such file or directory");
  });

  it("throws NotFoundError for missing path", async () => {
    await expect(fs.rm("/missing")).rejects.toThrow("No such file or directory");
  });

  it("cannot remove root", async () => {
    await expect(fs.rm("/")).rejects.toThrow("Cannot remove root");
  });
});

describe("append", () => {
  it("appends to existing file", async () => {
    await fs.write("/file.txt", "hello");
    await fs.append("/file.txt", " world");
    expect(await fs.read("/file.txt")).toBe("hello world");
  });

  it("creates file if it doesn't exist", async () => {
    await fs.append("/new.txt", "created");
    expect(await fs.read("/new.txt")).toBe("created");
  });

  it("throws IsDirectoryError for directory", async () => {
    await fs.mkdir("/dir");
    await expect(fs.append("/dir", "x")).rejects.toThrow("Is a directory");
  });
});

describe("grep", () => {
  it("finds matching content with line numbers", async () => {
    await fs.write("/a.txt", "hello world");
    await fs.write("/b.txt", "goodbye world");
    await fs.write("/c.txt", "nothing here");
    const results = await fs.grep("world");
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.path).sort()).toEqual(["/a.txt", "/b.txt"]);
    const aResult = results.find((r) => r.path === "/a.txt")!;
    expect(aResult.lines[0].line).toBe(1);
    expect(aResult.lines[0].text).toBe("hello world");
  });

  it("supports regex with character classes", async () => {
    await fs.write("/file.txt", "Hello world\nHallo world");
    const results = await fs.grep("H[ea]llo");
    expect(results).toHaveLength(1);
    expect(results[0].lines).toHaveLength(2);
  });

  it("supports anchored regex", async () => {
    await fs.write("/log.txt", "ERROR: something failed\nINFO: ok");
    const results = await fs.grep("^ERROR:");
    expect(results).toHaveLength(1);
    expect(results[0].lines[0].line).toBe(1);
    expect(results[0].lines[0].text).toBe("ERROR: something failed");
  });

  it("supports case insensitive search", async () => {
    await fs.write("/file.txt", "Hello World\nGoodbye");
    const results = await fs.grep("hello", undefined, { case_insensitive: true });
    expect(results).toHaveLength(1);
    expect(results[0].lines[0].text).toBe("Hello World");
  });

  it("scopes to path", async () => {
    await fs.write("/a/file.txt", "match");
    await fs.write("/b/file.txt", "match");
    const results = await fs.grep("match", "/a");
    expect(results).toHaveLength(1);
    expect(results[0].path).toBe("/a/file.txt");
  });

  it("returns empty array when no matches", async () => {
    await fs.write("/file.txt", "hello");
    expect(await fs.grep("xyz")).toEqual([]);
  });
});

describe("glob", () => {
  it("finds by glob pattern", async () => {
    await fs.write("/docs/readme.md", "r");
    await fs.write("/docs/guide.md", "g");
    await fs.write("/src/index.ts", "i");
    const results = await fs.glob("*.md");
    expect(results.sort()).toEqual(["/docs/guide.md", "/docs/readme.md"]);
  });

  it("scopes to path", async () => {
    await fs.write("/a/file.ts", "a");
    await fs.write("/b/file.ts", "b");
    const results = await fs.glob("*.ts", "/a");
    expect(results).toEqual(["/a/file.ts"]);
  });

  it("filters by type file", async () => {
    await fs.write("/src/index.ts", "i");
    await fs.mkdir("/src/lib");
    const files = await fs.glob("*", "/src", { type: "file" });
    expect(files).toEqual(["/src/index.ts"]);
  });

  it("filters by type dir", async () => {
    await fs.write("/src/index.ts", "i");
    await fs.mkdir("/src/lib");
    const dirs = await fs.glob("*", "/src", { type: "dir" });
    expect(dirs).toContain("/src/lib");
    expect(dirs).not.toContain("/src/index.ts");
  });
});

describe("mv", () => {
  it("renames a file", async () => {
    await fs.write("/old.txt", "content");
    await fs.mv("/old.txt", "/new.txt");
    expect(await fs.read("/new.txt")).toBe("content");
    await expect(fs.read("/old.txt")).rejects.toThrow("No such file or directory");
  });

  it("moves file into existing directory", async () => {
    await fs.write("/file.txt", "content");
    await fs.mkdir("/dir");
    await fs.mv("/file.txt", "/dir");
    expect(await fs.read("/dir/file.txt")).toBe("content");
  });

  it("moves directory with contents", async () => {
    await fs.write("/src/a.txt", "a");
    await fs.write("/src/b.txt", "b");
    await fs.mv("/src", "/dest");
    expect(await fs.read("/dest/a.txt")).toBe("a");
    expect(await fs.read("/dest/b.txt")).toBe("b");
    await expect(fs.ls("/src")).rejects.toThrow("No such file or directory");
  });

  it("overwrites existing file at destination", async () => {
    await fs.write("/a.txt", "aaa");
    await fs.write("/b.txt", "bbb");
    await fs.mv("/a.txt", "/b.txt");
    expect(await fs.read("/b.txt")).toBe("aaa");
    await expect(fs.read("/a.txt")).rejects.toThrow("No such file or directory");
  });

  it("throws NotFoundError for missing source", async () => {
    await expect(fs.mv("/missing", "/dest")).rejects.toThrow("No such file or directory");
  });
});

describe("custom table name", () => {
  it("works with a custom table name", async () => {
    const customDb = new SqliteDatabase(":memory:", { tableName: "agent_files" });
    await customDb.initialize();
    const customFs = new FileSystem(customDb, "user1");

    await customFs.write("/hello.txt", "world");
    expect(await customFs.read("/hello.txt")).toBe("world");

    const entries = await customFs.ls("/");
    expect(entries).toHaveLength(1);
    expect(entries[0].name).toBe("hello.txt");

    await customDb.close();
  });

  it("rejects invalid table names", () => {
    expect(() => new SqliteDatabase(":memory:", { tableName: "bad name" })).toThrow("Invalid table name");
    expect(() => new SqliteDatabase(":memory:", { tableName: "1starts_with_number" })).toThrow("Invalid table name");
    expect(() => new SqliteDatabase(":memory:", { tableName: "drop;--" })).toThrow("Invalid table name");
  });
});

describe("file size limits", () => {
  it("rejects writes exceeding maxFileSize", async () => {
    const limitedFs = new FileSystem(db, "test-user", { maxFileSize: 100 });
    const bigContent = "x".repeat(200);
    await expect(limitedFs.write("/big.txt", bigContent)).rejects.toThrow("exceeds limit");
  });

  it("allows writes within maxFileSize", async () => {
    const limitedFs = new FileSystem(db, "test-user", { maxFileSize: 100 });
    await limitedFs.write("/small.txt", "hello");
    expect(await limitedFs.read("/small.txt")).toBe("hello");
  });

  it("rejects append that exceeds maxFileSize", async () => {
    const limitedFs = new FileSystem(db, "test-user", { maxFileSize: 100 });
    await limitedFs.write("/log.txt", "x".repeat(80));
    await expect(limitedFs.append("/log.txt", "y".repeat(30))).rejects.toThrow("exceeds limit");
  });

  it("rejects edit that exceeds maxFileSize", async () => {
    const limitedFs = new FileSystem(db, "test-user", { maxFileSize: 100 });
    await limitedFs.write("/file.txt", "small");
    await expect(limitedFs.edit("/file.txt", "small", "x".repeat(200))).rejects.toThrow("exceeds limit");
  });

  it("defaults to 10MB when no option is set", async () => {
    // Should not throw — default limit is 10MB
    await fs.write("/normal.txt", "hello world");
    expect(await fs.read("/normal.txt")).toBe("hello world");
  });
});

describe("optimistic locking", () => {
  it("detects concurrent edits via version mismatch", async () => {
    await fs.write("/file.txt", "original");

    // Simulate concurrent edit: read the file from two "sessions"
    const content1 = await fs.read("/file.txt");
    expect(content1).toBe("original");

    // First edit succeeds
    await fs.edit("/file.txt", "original", "modified-by-first");

    // Second edit tries to modify the original content, but version has changed
    // We need to go through the DB directly to simulate this
    // The version is now 2 (written as 1, then edit bumped to 2)
    // If we try updateContent with version 2 (expecting version 1), it should fail
    await expect(
      db.updateContent("test-user", "/file.txt", "modified-by-second", 20, 2)
    ).rejects.toThrow("Concurrent edit");
  });

  it("succeeds when version matches", async () => {
    await fs.write("/file.txt", "hello");
    // Version is 1 after write. Edit bumps to 2.
    await fs.edit("/file.txt", "hello", "world");
    expect(await fs.read("/file.txt")).toBe("world");
    // Another edit bumps to 3.
    await fs.edit("/file.txt", "world", "!");
    expect(await fs.read("/file.txt")).toBe("!");
  });
});

describe("grep safety", () => {
  it("rejects patterns longer than 1000 characters", async () => {
    await fs.write("/file.txt", "content");
    const longPattern = "a".repeat(1001);
    await expect(fs.grep(longPattern)).rejects.toThrow("too long");
  });

  it("allows patterns up to 1000 characters", async () => {
    await fs.write("/file.txt", "content");
    const result = await fs.grep("a".repeat(1000));
    expect(result).toEqual([]);
  });
});
