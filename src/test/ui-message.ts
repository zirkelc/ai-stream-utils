import {
  fromUIMessage,
  type UIMessageChunkOf,
  type UIMessageChunks,
  type UIMessageParts,
} from "ai-test-kit/ui";
/**
 * The inferred type of `tools` reaches into the provider packages. Referencing
 * them here keeps that type nameable under pnpm's symlinked layout, which
 * declaration emit otherwise reports as non-portable (TS2742).
 */
import type {} from "@ai-sdk/provider";
import type {} from "@ai-sdk/provider-utils";
import { type InferUIMessageChunk, type InferUITools, tool, type UIMessage } from "ai";
import { z } from "zod";
import type { InferUIMessagePart } from "../types.js";

export type MyMetadata = { id: string };

export type MyDataPart = { weather: { location: string; temperature: number } };

export type MyTools = InferUITools<typeof tools>;

export type MyUIMessage = UIMessage<MyMetadata, MyDataPart, MyTools>;

export type MyUIMessageChunk = InferUIMessageChunk<MyUIMessage>;

export type MyUIMessagePart = InferUIMessagePart<MyUIMessage>;

/* Part and chunk types keyed by `type`, so a single variant is one indexed access */
type Parts = UIMessageParts<MyUIMessage>;
type Chunks = UIMessageChunks<MyUIMessage>;

/* Part type aliases */
export type TextPart = Parts["text"];
export type ReasoningPart = Parts["reasoning"];
export type ToolWeatherPart = Parts["tool-weather"];
export type DynamicToolPart = Parts["dynamic-tool"];
export type SourceUrlPart = Parts["source-url"];
export type SourceDocumentPart = Parts["source-document"];
export type DataWeatherPart = Parts["data-weather"];
export type FilePart = Parts["file"];
export type StepStartPart = Parts["step-start"];

/* Chunk type aliases */
export type TextChunk = Chunks["text-start" | "text-delta" | "text-end"];
export type TextStartChunk = Chunks["text-start"];
export type TextDeltaChunk = Chunks["text-delta"];
export type TextEndChunk = Chunks["text-end"];
export type ReasoningChunk = Chunks["reasoning-start" | "reasoning-delta" | "reasoning-end"];
/* Template key can't be an indexed access (wider than keyof), so use the extractor helper */
export type ToolChunk = UIMessageChunkOf<MyUIMessage, `tool-${string}`>;
export type SourceUrlChunk = Chunks["source-url"];
export type SourceDocumentChunk = Chunks["source-document"];
export type DataWeatherChunk = Chunks["data-weather"];
export type FileChunk = Chunks["file"];
export type StartStepChunk = Chunks["start-step"];
export type StartChunk = Chunks["start"];
export type FinishChunk = Chunks["finish"];

const weatherTool = tool({
  description: "Get the weather in a location",
  inputSchema: z.object({
    location: z.string().describe("The location to get the weather for"),
  }),
  execute: ({ location }) => ({
    location,
    temperature: 72 + Math.floor(Math.random() * 21) - 10,
  }),
});

// const calculatorTool = dynamicTool({
//   description: 'Calculate a mathematical expression',
//   inputSchema: z.object({}),
//   execute: (input) => {
//     const { expression } = input as { expression: string };
//     return {
//       result: `Result: ${expression}`,
//     };
//   },
// });

export const tools = {
  weather: weatherTool,
  // calculator: calculatorTool,
};

/* Builders bound to MyUIMessage so data/tool names and metadata are type-checked */
const { UIParts, UIChunks } = fromUIMessage<MyUIMessage>();

export const START_CHUNK: MyUIMessageChunk = UIChunks.start();
export const FINISH_CHUNK: MyUIMessageChunk = UIChunks.finish();
export const START_STEP_CHUNK: MyUIMessageChunk = UIChunks.startStep();
export const FINISH_STEP_CHUNK: MyUIMessageChunk = UIChunks.finishStep();
export const ABORT_CHUNK: MyUIMessageChunk = UIChunks.abort();
export const MESSAGE_METADATA_CHUNK: MyUIMessageChunk = UIChunks.messageMetadata({ id: "1" });
export const ERROR_CHUNK: MyUIMessageChunk = UIChunks.error("Test error");

export const TEXT_CHUNKS: MyUIMessageChunk[] = [
  UIChunks.startStep(),
  UIChunks.textStart({ id: "1" }),
  UIChunks.textDelta({ id: "1", delta: "Hello" }),
  UIChunks.textDelta({ id: "1", delta: " World" }),
  UIChunks.textEnd({ id: "1" }),
  UIChunks.finishStep(),
];

export const REASONING_CHUNKS: MyUIMessageChunk[] = [
  UIChunks.startStep(),
  UIChunks.reasoningStart({ id: "2" }),
  UIChunks.reasoningDelta({ id: "2", delta: "Think" }),
  UIChunks.reasoningDelta({ id: "2", delta: "ing..." }),
  UIChunks.reasoningEnd({ id: "2" }),
  UIChunks.finishStep(),
];

// Tool chunks with output (server-side tool with execute function)
export const TOOL_SERVER_CHUNKS: MyUIMessageChunk[] = [
  UIChunks.startStep(),
  ...UIChunks.toolInput({ toolCallId: "3", toolName: "weather", input: { location: "Tokyo" } }),
  UIChunks.toolOutputAvailable({ toolCallId: "3", output: { temperature: 72 } }),
  UIChunks.finishStep(),
];

// Tool chunks without output (client-side tool without execute function)
export const TOOL_CLIENT_CHUNKS: MyUIMessageChunk[] = [
  UIChunks.startStep(),
  UIChunks.toolInputStart({ toolCallId: "6", toolName: "weather" }),
  UIChunks.toolInputAvailable({
    toolCallId: "6",
    toolName: "weather",
    input: { location: "Tokyo" },
  }),
  UIChunks.finishStep(),
];

/**
 * Tool chunks with interleaved data chunk.
 * This simulates a real AI SDK stream where a tool's execute function
 * writes a data chunk via writer.write() mid-execution.
 */
export const TOOL_WITH_DATA_CHUNKS: MyUIMessageChunk[] = [
  UIChunks.startStep(),
  UIChunks.toolInputStart({ toolCallId: "10", toolName: "weather" }),
  UIChunks.toolInputDelta({ toolCallId: "10", inputTextDelta: '{"location":"Tokyo"}' }),
  UIChunks.data("weather", { location: "Tokyo", temperature: 72 }),
  UIChunks.toolInputAvailable({
    toolCallId: "10",
    toolName: "weather",
    input: { location: "Tokyo" },
  }),
  UIChunks.toolOutputAvailable({
    toolCallId: "10",
    output: { location: "Tokyo", temperature: 72 },
  }),
  UIChunks.finishStep(),
];

export const DYNAMIC_TOOL_CHUNKS: MyUIMessageChunk[] = [
  UIChunks.startStep(),
  UIChunks.toolInputStart({ toolCallId: "4", toolName: "calculator", dynamic: true }),
  UIChunks.toolInputAvailable({
    toolCallId: "4",
    toolName: "calculator",
    input: { expression: "2+2" },
    dynamic: true,
  }),
  UIChunks.toolOutputAvailable({ toolCallId: "4", output: { result: 4 }, dynamic: true }),
  UIChunks.finishStep(),
];

export const TOOL_ERROR_CHUNKS: MyUIMessageChunk[] = [
  UIChunks.startStep(),
  UIChunks.toolInputError({
    toolCallId: "5",
    toolName: "failed",
    input: {},
    errorText: "Invalid input",
  }),
  UIChunks.toolOutputError({ toolCallId: "5", errorText: "Execution failed" }),
  UIChunks.finishStep(),
];

export const SOURCE_CHUNKS: MyUIMessageChunk[] = [
  UIChunks.startStep(),
  UIChunks.sourceUrl({ sourceId: "source-1", url: "https://example.com", title: "Example Source" }),
  UIChunks.sourceDocument({
    sourceId: "source-2",
    mediaType: "application/pdf",
    title: "Document Title",
  }),
  UIChunks.finishStep(),
];

export const DATA_CHUNKS: MyUIMessageChunk[] = [
  UIChunks.startStep(),
  UIChunks.data("weather", { location: "Tokyo", temperature: 72 }),
  UIChunks.finishStep(),
];

export const FILE_CHUNKS: MyUIMessageChunk[] = [
  UIChunks.startStep(),
  UIChunks.file({ url: "https://example.com/file.pdf", mediaType: "application/pdf" }),
  UIChunks.finishStep(),
];

/* A file emitted inside a reasoning trace. Its own part type, despite the `reasoning-` prefix. */
export const REASONING_FILE_CHUNK: MyUIMessageChunk = UIChunks.reasoningFile({
  url: "https://example.com/trace.png",
  mediaType: "image/png",
});

/* Provider-specific content, keyed by `{provider}.{type}` */
export const CUSTOM_CHUNK: MyUIMessageChunk = UIChunks.custom({ kind: "openai.annotation" });

/* A tool call that is held for approval and then approved */
export const TOOL_APPROVAL_CHUNKS: MyUIMessageChunk[] = [
  UIChunks.startStep(),
  UIChunks.toolInputStart({ toolCallId: "7", toolName: "weather" }),
  UIChunks.toolInputAvailable({
    toolCallId: "7",
    toolName: "weather",
    input: { location: "Tokyo" },
  }),
  UIChunks.toolApprovalRequest({ toolCallId: "7", approvalId: "approval-7" }),
  UIChunks.toolApprovalResponse({ approvalId: "approval-7", approved: true }),
  UIChunks.toolOutputAvailable({ toolCallId: "7", output: { temperature: 72 } }),
  UIChunks.finishStep(),
];

export const TEXT_PART: MyUIMessagePart = UIParts.text("Hello World", { state: "done" });

export const REASONING_PART: MyUIMessagePart = UIParts.reasoning("Thinking...", { state: "done" });

export const TOOL_PART: MyUIMessagePart = UIParts.tool("weather", {
  toolCallId: "3",
  state: "output-available",
  input: { location: "Tokyo" },
  output: { location: "Tokyo", temperature: 72 },
});

export const DYNAMIC_TOOL_PART: MyUIMessagePart = UIParts.dynamicTool({
  toolCallId: "4",
  toolName: "calculator",
  state: "output-available",
  input: { expression: "2+2" },
  output: { result: 4 },
});

export const TOOL_ERROR_PART: MyUIMessagePart = UIParts.dynamicTool({
  toolCallId: "5",
  toolName: "failed",
  state: "output-error",
  input: {},
  errorText: "Execution failed",
});

export const SOURCE_URL_PART: MyUIMessagePart = UIParts.sourceUrl({
  sourceId: "source-1",
  url: "https://example.com",
  title: "Example Source",
});

export const SOURCE_DOCUMENT_PART: MyUIMessagePart = UIParts.sourceDocument({
  sourceId: "source-2",
  mediaType: "application/pdf",
  title: "Document Title",
});

export const DATA_PART: MyUIMessagePart = UIParts.data("weather", {
  location: "Tokyo",
  temperature: 72,
});

export const FILE_PART: MyUIMessagePart = UIParts.file({
  url: "https://example.com/file.pdf",
  mediaType: "application/pdf",
});
