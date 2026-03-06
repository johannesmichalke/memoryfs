import { describe, it, expect } from "vitest";
import { normalize, parentPath, baseName, allAncestors, globToLike } from "../../src/fs/paths.js";

describe("normalize", () => {
  it("handles root", () => {
    expect(normalize("/")).toBe("/");
    expect(normalize("")).toBe("/");
  });

  it("adds leading slash", () => {
    expect(normalize("foo/bar")).toBe("/foo/bar");
  });

  it("removes trailing slash", () => {
    expect(normalize("/foo/bar/")).toBe("/foo/bar");
  });

  it("resolves dots", () => {
    expect(normalize("/foo/./bar/../baz")).toBe("/foo/baz");
  });

  it("handles double slashes", () => {
    expect(normalize("//foo//bar")).toBe("/foo/bar");
  });
});

describe("parentPath", () => {
  it("root parent is root", () => {
    expect(parentPath("/")).toBe("/");
  });

  it("returns parent directory", () => {
    expect(parentPath("/foo/bar")).toBe("/foo");
    expect(parentPath("/foo")).toBe("/");
  });
});

describe("baseName", () => {
  it("returns base name", () => {
    expect(baseName("/foo/bar.txt")).toBe("bar.txt");
    expect(baseName("/foo")).toBe("foo");
  });

  it("root base is /", () => {
    expect(baseName("/")).toBe("/");
  });
});

describe("allAncestors", () => {
  it("returns all ancestors in order", () => {
    expect(allAncestors("/a/b/c")).toEqual(["/", "/a", "/a/b"]);
  });

  it("returns just root for top-level path", () => {
    expect(allAncestors("/foo")).toEqual(["/"]);
  });
});

describe("globToLike", () => {
  it("converts * to %", () => {
    expect(globToLike("*.md")).toBe("%.md");
  });

  it("converts ? to _", () => {
    expect(globToLike("file?.txt")).toBe("file_.txt");
  });

  it("converts ** to %", () => {
    expect(globToLike("**/*.ts")).toBe("%/%.ts");
  });

  it("escapes literal % and _", () => {
    expect(globToLike("100%_done")).toBe("100\\%\\_done");
  });
});
