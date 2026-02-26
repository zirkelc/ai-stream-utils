import { openai } from "@ai-sdk/openai";
import { type InferUITools, stepCountIs, streamText, tool, type UIMessage } from "ai";
import { z } from "zod";
import { excludeTools, includeTools, pipe } from "../src/pipe";

/**
 * Example demonstrating `excludeTools()` filter with keyword and semantic search tools.
 */

export type MyTools = InferUITools<typeof tools>;
export type MyUIMessage = UIMessage<{}, {}, MyTools>;

const tools = {
  keyword_search: tool({
    description: `Search for documents by keyword matching`,
    inputSchema: z.object({
      query: z.string().describe(`The keyword to search for`),
    }),
    execute: ({ query }) => ({
      results: [`doc1.pdf`, `doc2.pdf`, `doc3.pdf`],
    }),
  }),
  semantic_search: tool({
    description: `Search for documents by semantic similarity`,
    inputSchema: z.object({
      query: z.string().describe(`The query to search for semantically similar content`),
    }),
    execute: ({ query }) => ({
      results: [
        { doc: `doc1.pdf`, score: 0.95 },
        { doc: `doc2.pdf`, score: 0.87 },
      ],
    }),
  }),
};

const result = streamText({
  model: openai(`gpt-5`),
  prompt: `Search for information about TypeScript generics`,
  tools,
  stopWhen: stepCountIs(5),
});

/**
 * Example 1: Exclude ALL tool parts from the stream.
 * This filters out all tool-related chunks (tool-keywordSearch, tool-semanticSearch, etc.)
 */
const streamNoTools = pipe(result.toUIMessageStream<MyUIMessage>())
  .filter(excludeTools())
  .toStream();

/**
 * Example 2: Exclude a specific tool by name.
 * This filters out only the keyword_search tool chunks.
 */
const streamNoKeyword = pipe(result.toUIMessageStream<MyUIMessage>())
  .filter(excludeTools(`keyword_search`))
  .toStream();

/**
 * Example 3: Exclude multiple tools by name.
 * This filters out both search tool chunks.
 */
const streamNoSearch = pipe(result.toUIMessageStream<MyUIMessage>())
  .filter(excludeTools([`keyword_search`, `semantic_search`]))
  .toStream();

/**
 * Example 4: Include tools with no-op (all chunks pass through).
 * This is equivalent to not filtering at all.
 */
const streamAllChunks = pipe(result.toUIMessageStream<MyUIMessage>())
  .filter(includeTools())
  .toStream();

/**
 * Example 5: Include a specific tool by name.
 * Non-tool chunks (text, reasoning, etc.) still pass through.
 * Only the specified tool chunks are included; other tools are filtered out.
 */
const streamOnlyKeyword = pipe(result.toUIMessageStream<MyUIMessage>())
  .filter(includeTools(`keyword_search`))
  .toStream();

/**
 * Example 6: Include multiple tools by name.
 * Non-tool chunks still pass through.
 * Only the specified tool chunks (keyword_search, semantic_search) are included.
 */
const streamOnlySearch = pipe(result.toUIMessageStream<MyUIMessage>())
  .filter(includeTools([`keyword_search`, `semantic_search`]))
  .toStream();
