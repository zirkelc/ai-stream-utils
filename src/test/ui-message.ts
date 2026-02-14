import { type InferUIMessageChunk, type InferUITools, tool, type UIMessage } from "ai";
import { z } from "zod";
import type { InferUIMessagePart } from "../types.js";

export type MyMetadata = { id: string };

export type MyDataPart = { weather: { location: string; temperature: number } };

export type MyTools = InferUITools<typeof tools>;

export type MyUIMessage = UIMessage<MyMetadata, MyDataPart, MyTools>;

export type MyUIMessageChunk = InferUIMessageChunk<MyUIMessage>;

export type MyUIMessagePart = InferUIMessagePart<MyUIMessage>;

/* Part type aliases */
export type TextPart = Extract<MyUIMessagePart, { type: "text" }>;
export type ReasoningPart = Extract<MyUIMessagePart, { type: "reasoning" }>;
export type ToolWeatherPart = Extract<MyUIMessagePart, { type: "tool-weather" }>;
export type DynamicToolPart = Extract<MyUIMessagePart, { type: "dynamic-tool" }>;
export type SourceUrlPart = Extract<MyUIMessagePart, { type: "source-url" }>;
export type SourceDocumentPart = Extract<MyUIMessagePart, { type: "source-document" }>;
export type DataWeatherPart = Extract<MyUIMessagePart, { type: "data-weather" }>;
export type FilePart = Extract<MyUIMessagePart, { type: "file" }>;
export type StepStartPart = Extract<MyUIMessagePart, { type: "step-start" }>;

/* Chunk type aliases */
export type TextChunk = Extract<
  MyUIMessageChunk,
  { type: "text-start" | "text-delta" | "text-end" }
>;
export type TextDeltaChunk = Extract<MyUIMessageChunk, { type: "text-delta" }>;
export type ReasoningChunk = Extract<
  MyUIMessageChunk,
  { type: "reasoning-start" | "reasoning-delta" | "reasoning-end" }
>;
export type ToolChunk = Extract<MyUIMessageChunk, { type: `tool-${string}` }>;
export type SourceUrlChunk = Extract<MyUIMessageChunk, { type: "source-url" }>;
export type SourceDocumentChunk = Extract<MyUIMessageChunk, { type: "source-document" }>;
export type DataWeatherChunk = Extract<MyUIMessageChunk, { type: "data-weather" }>;
export type FileChunk = Extract<MyUIMessageChunk, { type: "file" }>;
export type StartStepChunk = Extract<MyUIMessageChunk, { type: "start-step" }>;
export type StartChunk = Extract<MyUIMessageChunk, { type: `start` }>;
export type FinishChunk = Extract<MyUIMessageChunk, { type: `finish` }>;

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

const tools = {
  weather: weatherTool,
  // calculator: calculatorTool,
};

export const START_CHUNK: MyUIMessageChunk = { type: "start" };
export const FINISH_CHUNK: MyUIMessageChunk = { type: "finish" };
export const START_STEP_CHUNK: MyUIMessageChunk = { type: "start-step" };
export const FINISH_STEP_CHUNK: MyUIMessageChunk = { type: "finish-step" };
export const ABORT_CHUNK: MyUIMessageChunk = { type: "abort" };
export const MESSAGE_METADATA_CHUNK: MyUIMessageChunk = {
  type: "message-metadata",
  messageMetadata: { id: "1" },
};
export const ERROR_CHUNK: MyUIMessageChunk = {
  type: "error",
  errorText: "Test error",
};

export const TEXT_CHUNKS: MyUIMessageChunk[] = [
  { type: "start-step" },
  { type: "text-start", id: "1" },
  { type: "text-delta", id: "1", delta: "Hello" },
  { type: "text-delta", id: "1", delta: " World" },
  { type: "text-end", id: "1" },
  { type: "finish-step" },
];

export const REASONING_CHUNKS: MyUIMessageChunk[] = [
  { type: "start-step" },
  { type: "reasoning-start", id: "2" },
  { type: "reasoning-delta", id: "2", delta: "Think" },
  { type: "reasoning-delta", id: "2", delta: "ing..." },
  { type: "reasoning-end", id: "2" },
  { type: "finish-step" },
];

// Tool chunks with output (server-side tool with execute function)
export const TOOL_SERVER_CHUNKS: MyUIMessageChunk[] = [
  { type: "start-step" },
  {
    type: "tool-input-start",
    toolCallId: "3",
    toolName: "weather",
  },
  {
    type: "tool-input-delta",
    toolCallId: "3",
    inputTextDelta: '{"location":"Tokyo"}',
  },
  {
    type: "tool-input-available",
    toolCallId: "3",
    toolName: "weather",
    input: { location: "Tokyo" },
  },
  {
    type: "tool-output-available",
    toolCallId: "3",
    output: { temperature: 72 },
  },
  { type: "finish-step" },
];

// Tool chunks without output (client-side tool without execute function)
export const TOOL_CLIENT_CHUNKS: MyUIMessageChunk[] = [
  { type: "start-step" },
  {
    type: "tool-input-start",
    toolCallId: "6",
    toolName: "weather",
  },
  {
    type: "tool-input-available",
    toolCallId: "6",
    toolName: "weather",
    input: { location: "Tokyo" },
  },
  { type: "finish-step" },
];

/**
 * Tool chunks with interleaved data chunk.
 * This simulates a real AI SDK stream where a tool's execute function
 * writes a data chunk via writer.write() mid-execution.
 */
export const TOOL_WITH_DATA_CHUNKS: MyUIMessageChunk[] = [
  { type: "start-step" },
  { type: "tool-input-start", toolCallId: "10", toolName: "weather" },
  {
    type: "tool-input-delta",
    toolCallId: "10",
    inputTextDelta: '{"location":"Tokyo"}',
  },
  { type: "data-weather", data: { location: "Tokyo", temperature: 72 } },
  {
    type: "tool-input-available",
    toolCallId: "10",
    toolName: "weather",
    input: { location: "Tokyo" },
  },
  {
    type: "tool-output-available",
    toolCallId: "10",
    output: { location: "Tokyo", temperature: 72 },
  },
  { type: "finish-step" },
];

export const DYNAMIC_TOOL_CHUNKS: MyUIMessageChunk[] = [
  { type: "start-step" },
  {
    type: "tool-input-start",
    toolCallId: "4",
    toolName: "calculator",
    dynamic: true,
  },
  {
    type: "tool-input-available",
    toolCallId: "4",
    toolName: "calculator",
    input: { expression: "2+2" },
    dynamic: true,
  },
  {
    type: "tool-output-available",
    toolCallId: "4",
    output: { result: 4 },
    dynamic: true,
  },
  { type: "finish-step" },
];

export const TOOL_ERROR_CHUNKS: MyUIMessageChunk[] = [
  { type: "start-step" },
  {
    type: "tool-input-error",
    toolCallId: "5",
    toolName: "failed",
    input: {},
    errorText: "Invalid input",
  },
  {
    type: "tool-output-error",
    toolCallId: "5",
    errorText: "Execution failed",
  },
  { type: "finish-step" },
];

export const SOURCE_CHUNKS: MyUIMessageChunk[] = [
  { type: "start-step" },
  {
    type: "source-url",
    sourceId: "source-1",
    url: "https://example.com",
    title: "Example Source",
  },
  {
    type: "source-document",
    sourceId: "source-2",
    mediaType: "application/pdf",
    title: "Document Title",
  },
  { type: "finish-step" },
];

export const DATA_CHUNKS: MyUIMessageChunk[] = [
  { type: "start-step" },
  {
    type: "data-weather",
    data: { location: "Tokyo", temperature: 72 },
  },
  { type: "finish-step" },
];

export const FILE_CHUNKS: MyUIMessageChunk[] = [
  { type: "start-step" },
  {
    type: "file",
    url: "https://example.com/file.pdf",
    mediaType: "application/pdf",
  },
  { type: "finish-step" },
];

export const TEXT_PART: MyUIMessagePart = {
  type: "text",
  text: "Hello World",
  state: "done",
};

export const REASONING_PART: MyUIMessagePart = {
  type: "reasoning",
  text: "Thinking...",
  state: "done",
};

export const TOOL_PART: MyUIMessagePart = {
  type: "tool-weather",
  toolCallId: "3",
  state: "output-available",
  input: { location: "Tokyo" },
  output: { location: "Tokyo", temperature: 72 },
};

export const DYNAMIC_TOOL_PART: MyUIMessagePart = {
  type: "dynamic-tool",
  toolCallId: "4",
  toolName: "calculator",
  state: "output-available",
  input: { expression: "2+2" },
  output: { result: 4 },
};

export const TOOL_ERROR_PART: MyUIMessagePart = {
  type: "dynamic-tool",
  toolCallId: "5",
  toolName: "failed",
  state: "output-error",
  input: {},
  errorText: "Execution failed",
};

export const SOURCE_URL_PART: MyUIMessagePart = {
  type: "source-url",
  sourceId: "source-1",
  url: "https://example.com",
  title: "Example Source",
};

export const SOURCE_DOCUMENT_PART: MyUIMessagePart = {
  type: "source-document",
  sourceId: "source-2",
  mediaType: "application/pdf",
  title: "Document Title",
};

export const DATA_PART: MyUIMessagePart = {
  type: "data-weather",
  data: { location: "Tokyo", temperature: 72 },
};

export const FILE_PART: MyUIMessagePart = {
  type: "file",
  url: "https://example.com/file.pdf",
  mediaType: "application/pdf",
};
