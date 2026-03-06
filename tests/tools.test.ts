import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { FileSystem } from "../src/fs/operations.js";
import { SqliteDatabase } from "../src/db/sqlite.js";
import { tools, callTool, getTool } from "../src/tools.js";

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

describe("tools array", () => {
  it("has 11 tools", () => {
    expect(tools).toHaveLength(11);
  });

  it("every tool has name, description, parameters, and call", () => {
    for (const tool of tools) {
      expect(tool.name).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(tool.parameters).toBeTruthy();
      expect(typeof tool.call).toBe("function");
    }
  });
});

describe("getTool", () => {
  it("returns tool by name", () => {
    expect(getTool("read")?.name).toBe("read");
  });

  it("returns undefined for unknown tool", () => {
    expect(getTool("nope")).toBeUndefined();
  });
});

describe("callTool", () => {
  it("write + read round-trip", async () => {
    const w = await callTool(fs, "write", { path: "/hello.txt", content: "world" });
    expect(w.isError).toBeFalsy();
    expect(w.text).toContain("Wrote");

    const r = await callTool(fs, "read", { path: "/hello.txt" });
    expect(r.isError).toBeFalsy();
    expect(r.text).toBe("world");
  });

  it("edit", async () => {
    await callTool(fs, "write", { path: "/file.txt", content: "foo bar" });
    const result = await callTool(fs, "edit", { path: "/file.txt", old_string: "bar", new_string: "baz" });
    expect(result.isError).toBeFalsy();
    expect((await callTool(fs, "read", { path: "/file.txt" })).text).toBe("foo baz");
  });

  it("multi_edit", async () => {
    await callTool(fs, "write", { path: "/file.txt", content: "aaa bbb ccc" });
    const result = await callTool(fs, "multi_edit", {
      path: "/file.txt",
      edits: [
        { old_string: "aaa", new_string: "xxx" },
        { old_string: "ccc", new_string: "zzz" },
      ],
    });
    expect(result.isError).toBeFalsy();
    expect(result.text).toContain("2 edits");
    expect((await callTool(fs, "read", { path: "/file.txt" })).text).toBe("xxx bbb zzz");
  });

  it("append", async () => {
    await callTool(fs, "write", { path: "/log.txt", content: "line1\n" });
    await callTool(fs, "append", { path: "/log.txt", content: "line2\n" });
    expect((await callTool(fs, "read", { path: "/log.txt" })).text).toBe("line1\nline2\n");
  });

  it("ls", async () => {
    await callTool(fs, "write", { path: "/a.txt", content: "a" });
    await callTool(fs, "mkdir", { path: "/dir" });
    const result = await callTool(fs, "ls", { path: "/" });
    expect(result.text).toContain("dir/");
    expect(result.text).toContain("a.txt");
  });

  it("ls recursive", async () => {
    await callTool(fs, "write", { path: "/a/b/c.txt", content: "deep" });
    const result = await callTool(fs, "ls", { path: "/", recursive: true });
    expect(result.text).toContain("/a/b/c.txt");
  });

  it("rm", async () => {
    await callTool(fs, "write", { path: "/tmp.txt", content: "x" });
    await callTool(fs, "rm", { path: "/tmp.txt" });
    const result = await callTool(fs, "read", { path: "/tmp.txt" });
    expect(result.isError).toBe(true);
    expect(result.text).toContain("No such file");
  });

  it("grep", async () => {
    await callTool(fs, "write", { path: "/log.txt", content: "ERROR: bad\nINFO: ok" });
    const result = await callTool(fs, "grep", { pattern: "ERROR" });
    expect(result.text).toContain("/log.txt");
    expect(result.text).toContain("1: ERROR: bad");
  });

  it("glob", async () => {
    await callTool(fs, "write", { path: "/docs/readme.md", content: "hi" });
    const result = await callTool(fs, "glob", { pattern: "*.md" });
    expect(result.text).toContain("/docs/readme.md");
  });

  it("mv", async () => {
    await callTool(fs, "write", { path: "/old.txt", content: "data" });
    await callTool(fs, "mv", { from: "/old.txt", to: "/new.txt" });
    expect((await callTool(fs, "read", { path: "/new.txt" })).text).toBe("data");
  });

  it("returns error for unknown tool", async () => {
    const result = await callTool(fs, "nope", {});
    expect(result.isError).toBe(true);
    expect(result.text).toContain("Unknown tool");
  });

  it("returns error instead of throwing", async () => {
    const result = await callTool(fs, "read", { path: "/missing" });
    expect(result.isError).toBe(true);
    expect(result.text).toContain("No such file");
  });
});
