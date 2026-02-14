import type { InferUIMessageChunk, UIMessage } from "ai";
import type { ExtractChunk, InferUIMessagePart } from "../types.js";
import type { InternalChunk } from "./base-pipeline.js";

/**
 * Input for chunk-based operations.
 * Part only contains the type field for performance - full part is not assembled.
 */
export type ChunkInput<CHUNK, PART extends { type: string }> = {
  chunk: CHUNK;
  part: Pick<PART, `type`>;
};

/**
 * Predicate for chunk-based operations (filter, collect).
 * Returns true to include the chunk, false to exclude.
 * The __brand exclusion prevents type guards from matching this type.
 */
export type ChunkPredicate<CHUNK, PART extends { type: string }> = ((
  input: ChunkInput<CHUNK, PART>,
) => boolean) & { __brand?: never };

/**
 * Map function for chunk-based operations.
 * Returns transformed chunk(s) or null to remove.
 */
export type ChunkMapFn<
  UI_MESSAGE extends UIMessage,
  CHUNK extends InferUIMessageChunk<UI_MESSAGE>,
  PART extends InferUIMessagePart<UI_MESSAGE>,
> = (
  input: ChunkInput<CHUNK, PART>,
) => InferUIMessageChunk<UI_MESSAGE> | Array<InferUIMessageChunk<UI_MESSAGE>> | null;

/**
 * Input for .on() observer operations.
 * Part is optional since meta chunks don't have a part type.
 */
export type ChunkOnInput<
  CHUNK,
  PART extends { type: string } | undefined = { type: string } | undefined,
> = {
  chunk: CHUNK;
  part: PART;
};

/**
 * Callback function for .on() observer.
 * Called for each matching chunk. Can be sync or async.
 */
export type ChunkOnFn<CHUNK, PART extends { type: string } | undefined = undefined> = (
  input: ChunkOnInput<CHUNK, PART>,
) => void | Promise<void>;

/**
 * Builder function for ChunkPipeline operations.
 * Uses AsyncIterable instead of ReadableStream for deferred conversion.
 */
export type ChunkBuilder<UI_MESSAGE extends UIMessage> = (
  iterable: AsyncIterable<InternalChunk<UI_MESSAGE>>,
) => AsyncIterable<InternalChunk<UI_MESSAGE>>;

/**
 * Type guard predicate for chunk types.
 * Used with `.filter()` to narrow chunk types.
 * Generic T allows the guard to preserve other properties (like `part`) from the input.
 * The __brand property is used to distinguish from plain predicates (never actually exists at runtime).
 */
export type ChunkTypeGuard<UI_MESSAGE extends UIMessage, CHUNK_TYPE extends string> = {
  <T extends { chunk: InferUIMessageChunk<UI_MESSAGE> }>(
    input: T,
  ): input is T & {
    chunk: ExtractChunk<UI_MESSAGE, CHUNK_TYPE>;
  };
  /** @internal Type brand - never exists at runtime */
  readonly __brand: `ChunkTypeGuard`;
};

/**
 * Type guard predicate for part types.
 * Used with `.filter()` and `.match()` to narrow types.
 * Generic T allows the guard to preserve other properties (like `chunk`) from the input.
 * The __brand property is used to distinguish from plain predicates (never actually exists at runtime).
 */
export type PartTypeGuard<UI_MESSAGE extends UIMessage, PART_TYPE extends string> = {
  <T extends { part: { type: string } }>(input: T): input is T & { part: { type: PART_TYPE } };
  /** @internal Type brand - never exists at runtime */
  readonly __brand: `PartTypeGuard`;
};
