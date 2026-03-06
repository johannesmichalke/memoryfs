import os
import tempfile

import pytest

from agent_vfs import FileSystem, open_database
from agent_vfs.errors import (
    EditConflictError,
    FileSizeError,
    IsDirectoryError,
    NotDirectoryError,
    NotFoundError,
)


@pytest.fixture
def fs(tmp_path):
    db_path = str(tmp_path / "test.db")
    db = open_database(db_path)
    return FileSystem(db, "test-user")


@pytest.fixture
def fs_small(tmp_path):
    db_path = str(tmp_path / "test.db")
    db = open_database(db_path)
    return FileSystem(db, "test-user", max_file_size=100)


class TestWrite:
    def test_write_and_read(self, fs):
        fs.write("/hello.txt", "world")
        assert fs.read("/hello.txt") == "world"

    def test_write_creates_parents(self, fs):
        fs.write("/a/b/c.txt", "deep")
        assert fs.read("/a/b/c.txt") == "deep"

    def test_write_overwrite(self, fs):
        fs.write("/f.txt", "old")
        fs.write("/f.txt", "new")
        assert fs.read("/f.txt") == "new"

    def test_write_to_directory_raises(self, fs):
        fs.mkdir("/dir")
        with pytest.raises(IsDirectoryError):
            fs.write("/dir", "content")


class TestRead:
    def test_read_not_found(self, fs):
        with pytest.raises(NotFoundError):
            fs.read("/nope.txt")

    def test_read_directory_raises(self, fs):
        fs.mkdir("/dir")
        with pytest.raises(IsDirectoryError):
            fs.read("/dir")

    def test_read_with_offset_limit(self, fs):
        fs.write("/lines.txt", "a\nb\nc\nd\ne")
        result = fs.read("/lines.txt", offset=2, limit=2)
        assert result == "b\nc"


class TestEdit:
    def test_edit(self, fs):
        fs.write("/f.txt", "hello world")
        fs.edit("/f.txt", "world", "earth")
        assert fs.read("/f.txt") == "hello earth"

    def test_edit_not_found(self, fs):
        fs.write("/f.txt", "hello")
        with pytest.raises(EditConflictError):
            fs.edit("/f.txt", "xyz", "abc")

    def test_edit_not_unique(self, fs):
        fs.write("/f.txt", "aaa")
        with pytest.raises(EditConflictError):
            fs.edit("/f.txt", "a", "b")


class TestMultiEdit:
    def test_multi_edit(self, fs):
        fs.write("/f.txt", "foo bar baz")
        fs.multi_edit("/f.txt", [
            {"old_string": "foo", "new_string": "FOO"},
            {"old_string": "baz", "new_string": "BAZ"},
        ])
        assert fs.read("/f.txt") == "FOO bar BAZ"


class TestLs:
    def test_ls_empty_root(self, fs):
        assert fs.ls("/") == []

    def test_ls_files(self, fs):
        fs.write("/a.txt", "a")
        fs.write("/b.txt", "b")
        entries = fs.ls("/")
        names = [e["name"] for e in entries]
        assert "a.txt" in names
        assert "b.txt" in names

    def test_ls_not_found(self, fs):
        with pytest.raises(NotFoundError):
            fs.ls("/nope")

    def test_ls_recursive(self, fs):
        fs.write("/a/b/c.txt", "deep")
        entries = fs.ls("/", recursive=True)
        paths = [e["path"] for e in entries]
        assert "/a/b/c.txt" in paths


class TestMkdir:
    def test_mkdir(self, fs):
        fs.mkdir("/dir")
        entries = fs.ls("/")
        assert any(e["name"] == "dir" and e["is_dir"] for e in entries)

    def test_mkdir_idempotent(self, fs):
        fs.mkdir("/dir")
        fs.mkdir("/dir")  # no error

    def test_mkdir_creates_parents(self, fs):
        fs.mkdir("/a/b/c")
        entries = fs.ls("/a/b")
        assert any(e["name"] == "c" for e in entries)


class TestRm:
    def test_rm_file(self, fs):
        fs.write("/f.txt", "x")
        fs.rm("/f.txt")
        with pytest.raises(NotFoundError):
            fs.read("/f.txt")

    def test_rm_directory_recursive(self, fs):
        fs.write("/dir/a.txt", "a")
        fs.write("/dir/b.txt", "b")
        fs.rm("/dir")
        with pytest.raises(NotFoundError):
            fs.ls("/dir")

    def test_rm_not_found(self, fs):
        with pytest.raises(NotFoundError):
            fs.rm("/nope")

    def test_rm_root_raises(self, fs):
        with pytest.raises(ValueError):
            fs.rm("/")


class TestAppend:
    def test_append_creates(self, fs):
        fs.append("/f.txt", "hello")
        assert fs.read("/f.txt") == "hello"

    def test_append_adds(self, fs):
        fs.write("/f.txt", "hello")
        fs.append("/f.txt", " world")
        assert fs.read("/f.txt") == "hello world"


class TestGrep:
    def test_grep_basic(self, fs):
        fs.write("/f.txt", "line one\nline two\nline three")
        results = fs.grep("two")
        assert len(results) == 1
        assert results[0]["lines"][0]["text"] == "line two"

    def test_grep_regex(self, fs):
        fs.write("/f.txt", "foo123\nbar456")
        results = fs.grep(r"\d+")
        assert len(results) == 1
        assert len(results[0]["lines"]) == 2

    def test_grep_no_match(self, fs):
        fs.write("/f.txt", "hello")
        results = fs.grep("xyz")
        assert results == []

    def test_grep_pattern_too_long(self, fs):
        with pytest.raises(ValueError):
            fs.grep("a" * 1001)


class TestGlob:
    def test_glob(self, fs):
        fs.write("/notes.md", "n")
        fs.write("/readme.md", "r")
        fs.write("/code.py", "c")
        paths = fs.glob("*.md")
        assert "/notes.md" in paths
        assert "/readme.md" in paths
        assert "/code.py" not in paths


class TestMv:
    def test_mv_file(self, fs):
        fs.write("/a.txt", "content")
        fs.mv("/a.txt", "/b.txt")
        assert fs.read("/b.txt") == "content"
        with pytest.raises(NotFoundError):
            fs.read("/a.txt")

    def test_mv_into_directory(self, fs):
        fs.write("/f.txt", "content")
        fs.mkdir("/dir")
        fs.mv("/f.txt", "/dir")
        assert fs.read("/dir/f.txt") == "content"


class TestMultiTenancy:
    def test_isolation(self, tmp_path):
        db = open_database(str(tmp_path / "test.db"))
        alice = FileSystem(db, "alice")
        bob = FileSystem(db, "bob")
        alice.write("/secret.txt", "alice only")
        with pytest.raises(NotFoundError):
            bob.read("/secret.txt")


class TestFileSizeLimit:
    def test_write_exceeds(self, fs_small):
        with pytest.raises(FileSizeError):
            fs_small.write("/f.txt", "x" * 200)

    def test_edit_exceeds(self, fs_small):
        fs_small.write("/f.txt", "small")
        with pytest.raises(FileSizeError):
            fs_small.edit("/f.txt", "small", "x" * 200)

    def test_append_exceeds(self, fs_small):
        fs_small.write("/f.txt", "x" * 50)
        with pytest.raises(FileSizeError):
            fs_small.append("/f.txt", "x" * 60)


class TestCustomTableName:
    def test_custom_table(self, tmp_path):
        db = open_database(str(tmp_path / "test.db"), table_name="agent_files")
        fs = FileSystem(db, "user1")
        fs.write("/test.txt", "works")
        assert fs.read("/test.txt") == "works"
