from __future__ import annotations

import json
from typing import Any

from .operations import FileSystem
from .tools import TOOLS, call_tool


def openai(fs: FileSystem):
    """Create OpenAI-compatible tool definitions and handler.

    Usage:
        tools, handle = openai(fs)
        response = client.chat.completions.create(model="gpt-4o", messages=messages, tools=tools)
        for call in response.choices[0].message.tool_calls:
            result = handle(call.function.name, call.function.arguments)
    """
    tool_defs = [
        {
            "type": "function",
            "function": {
                "name": t["name"],
                "description": t["description"],
                "parameters": t["parameters"],
            },
        }
        for t in TOOLS
    ]

    def handle_tool_call(name: str, args: str | dict[str, Any]) -> dict:
        parsed = json.loads(args) if isinstance(args, str) else args
        return call_tool(fs, name, parsed)

    return tool_defs, handle_tool_call


def anthropic(fs: FileSystem):
    """Create Anthropic-compatible tool definitions and handler.

    Usage:
        tools, handle = anthropic(fs)
        response = client.messages.create(model="claude-sonnet-4-20250514", messages=messages, tools=tools)
        for block in response.content:
            if block.type == "tool_use":
                result = handle(block.name, block.input)
    """
    tool_defs = [
        {
            "name": t["name"],
            "description": t["description"],
            "input_schema": t["parameters"],
        }
        for t in TOOLS
    ]

    def handle_tool_call(name: str, args: dict[str, Any]) -> dict:
        return call_tool(fs, name, args)

    return tool_defs, handle_tool_call
