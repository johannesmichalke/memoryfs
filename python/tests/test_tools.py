import pytest

from agent_vfs import FileSystem, open_database, call_tool, get_tool, tools
from agent_vfs.adapters import openai, anthropic


@pytest.fixture
def fs(tmp_path):
    db = open_database(str(tmp_path / "test.db"))
    return FileSystem(db, "test-user")


class TestCallTool:
    def test_write_and_read(self, fs):
        result = call_tool(fs, "write", {"path": "/f.txt", "content": "hello"})
        assert not result.get("is_error")
        result = call_tool(fs, "read", {"path": "/f.txt"})
        assert result["text"] == "hello"

    def test_unknown_tool(self, fs):
        result = call_tool(fs, "nope", {})
        assert result["is_error"]

    def test_error_returns_text(self, fs):
        result = call_tool(fs, "read", {"path": "/missing.txt"})
        assert result["is_error"]
        assert "No such file" in result["text"]


class TestGetTool:
    def test_existing(self):
        t = get_tool("read")
        assert t is not None
        assert t["name"] == "read"

    def test_missing(self):
        assert get_tool("nope") is None


class TestToolsList:
    def test_count(self):
        assert len(tools) == 11


class TestOpenAIAdapter:
    def test_format(self, fs):
        tool_defs, handle = openai(fs)
        assert len(tool_defs) == 11
        assert tool_defs[0]["type"] == "function"
        assert "name" in tool_defs[0]["function"]

    def test_handle_string_args(self, fs):
        _, handle = openai(fs)
        result = handle("write", '{"path": "/f.txt", "content": "hi"}')
        assert not result.get("is_error")

    def test_handle_dict_args(self, fs):
        _, handle = openai(fs)
        handle("write", {"path": "/f.txt", "content": "hi"})
        result = handle("read", {"path": "/f.txt"})
        assert result["text"] == "hi"


class TestAnthropicAdapter:
    def test_format(self, fs):
        tool_defs, handle = anthropic(fs)
        assert len(tool_defs) == 11
        assert "input_schema" in tool_defs[0]

    def test_handle(self, fs):
        _, handle = anthropic(fs)
        handle("write", {"path": "/f.txt", "content": "hi"})
        result = handle("read", {"path": "/f.txt"})
        assert result["text"] == "hi"
