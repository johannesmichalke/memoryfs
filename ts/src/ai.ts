import { tool, jsonSchema } from "ai";
import type { FileSystem } from "./fs/operations.js";
import type { ToolResult } from "./tools.js";
import { tools as rawTools, callTool } from "./tools.js";

/**
 * Creates AI SDK-compatible tools from a FileSystem instance.
 * Drop directly into generateText/streamText.
 *
 * ```ts
 * import { createTools } from "agent-vfs/ai";
 * const tools = createTools(fs);
 * await generateText({ model, tools, prompt });
 * ```
 */
export function createTools(fs: FileSystem) {
  const result: Record<string, ReturnType<typeof tool<Record<string, unknown>, ToolResult>>> = {};

  for (const t of rawTools) {
    result[t.name] = tool({
      description: t.description,
      inputSchema: jsonSchema<Record<string, unknown>>(
        t.parameters as Parameters<typeof jsonSchema>[0]
      ),
      execute: async (args) => {
        return callTool(fs, t.name, args);
      },
    });
  }

  return result;
}
