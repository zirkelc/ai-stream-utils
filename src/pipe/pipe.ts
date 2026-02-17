import type { InferUIMessageChunk, UIMessage } from "ai";
import { getPartTypeFromChunk, type ToolCallIdMap } from "../internal/get-part-type-from-chunk.js";
import type { InferUIMessagePart } from "../types.js";
import { createAsyncIterableStream } from "../utils/create-async-iterable-stream.js";
import type { InternalChunk } from "./base-pipeline.js";
import { ChunkPipeline } from "./chunk-pipeline.js";

/**
 * Input type for `pipe()` that accepts either a ReadableStream or an AsyncIterable.
 */
type PipeInput<UI_MESSAGE extends UIMessage> =
  | ReadableStream<InferUIMessageChunk<UI_MESSAGE>>
  | AsyncIterable<InferUIMessageChunk<UI_MESSAGE>>;

/**
 * Creates an iterable with part type information from a raw chunk stream.
 *
 * Part type is derived directly from the chunk's type rather than from message.parts[-1],
 * which ensures correct association when chunks from different part types are interleaved.
 *
 * Step boundaries (start-step/finish-step) pass through as-is with undefined partType.
 * The AI SDK's readUIMessageStream handles all step boundary scenarios gracefully.
 */
async function* createIterable<UI_MESSAGE extends UIMessage>(
  input: PipeInput<UI_MESSAGE>,
): AsyncIterable<InternalChunk<UI_MESSAGE>> {
  /**
   * Tracks toolCallId → partType mapping for tool chunks
   */
  const toolCallIdMap: ToolCallIdMap = new Map();

  /**
   * Use Symbol.asyncIterator if available (AsyncIterable), otherwise convert ReadableStream
   */
  const iterable: AsyncIterable<InferUIMessageChunk<UI_MESSAGE>> =
    Symbol.asyncIterator in input ? input : createAsyncIterableStream(input);

  for await (const chunk of iterable) {
    const partType = getPartTypeFromChunk<UI_MESSAGE>(chunk, toolCallIdMap);
    yield { chunk, partType };
  }
}

/**
 * Creates a type-safe pipeline for UIMessageStream operations.
 *
 * @example
 * ```typescript
 * pipe<MyUIMessage>(stream)
 *   .filter(isPartType('text'))
 *   .map(({ chunk }) => chunk)
 *   .toStream();
 * ```
 */
export function pipe<UI_MESSAGE extends UIMessage>(
  input: PipeInput<UI_MESSAGE>,
): ChunkPipeline<UI_MESSAGE, InferUIMessageChunk<UI_MESSAGE>, InferUIMessagePart<UI_MESSAGE>> {
  /**
   * Create internal iterable with part type information
   */
  const sourceIterable = createIterable<UI_MESSAGE>(input);

  return new ChunkPipeline(sourceIterable);
}
