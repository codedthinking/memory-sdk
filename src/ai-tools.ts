/**
 * @codedthinking/memory-sdk/ai-tools
 *
 * Wraps any MemoryProvider into AI SDK tool() calls for use with streamText/generateText.
 * Optional entry point — only import if you have `ai` and `zod` as dependencies.
 */
import { tool } from "ai";
import { z } from "zod";
import type { MemoryProvider } from "./types.js";

/**
 * Create AI SDK tools from any MemoryProvider.
 *
 * ```ts
 * const tools = memoryTools(provider)
 * streamText({ model, messages, tools: { ...tools, ...otherTools } })
 * ```
 */
export function memoryTools(
  provider: MemoryProvider,
  _context?: { sessionId?: string },
) {
  return {
    remember: tool({
      description: "Store conversation messages into long-term memory",
      inputSchema: z.object({
        messages: z.array(
          z.object({
            role: z.enum(["user", "assistant", "system", "tool"]),
            content: z.string(),
          }),
        ),
      }),
      execute: async ({ messages }) => {
        await provider.remember(messages);
        return { stored: messages.length };
      },
    }),

    recall: tool({
      description: "Search memory for relevant past context",
      inputSchema: z.object({
        query: z.string().describe("Semantic search query"),
        topK: z.number().optional().default(5),
      }),
      execute: async ({ query, topK }) => {
        return provider.recall(query, { topK });
      },
    }),

    forget: tool({
      description: "Remove a specific memory by ID",
      inputSchema: z.object({
        id: z.string().describe("The memory ID to delete"),
      }),
      execute: async ({ id }) => {
        await provider.forget({ id });
        return { deleted: id };
      },
    }),
  };
}
