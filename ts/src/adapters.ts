import type { FileSystem } from "./fs/operations.js";
import type { ToolResult } from "./tools.js";
import { tools, callTool } from "./tools.js";

// OpenAI / OpenAI-compatible (Groq, Together, Fireworks, etc.)
export function openai(fs: FileSystem) {
  const toolDefs = tools.map(t => ({
    type: "function" as const,
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));

  async function handleToolCall(name: string, args: string | Record<string, unknown>): Promise<ToolResult> {
    const parsed = typeof args === "string" ? JSON.parse(args) : args;
    return callTool(fs, name, parsed);
  }

  return { tools: toolDefs, handleToolCall };
}

// Anthropic
export function anthropic(fs: FileSystem) {
  const toolDefs = tools.map(t => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters as Record<string, unknown>,
  }));

  async function handleToolCall(name: string, input: Record<string, unknown>): Promise<ToolResult> {
    return callTool(fs, name, input);
  }

  return { tools: toolDefs, handleToolCall };
}
