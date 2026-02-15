import type { InferUIMessageChunk, UIMessage } from "ai";
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
 * Filter predicate for chunk-based operations.
 * Returns true to include the chunk, false to exclude.
 * The __brand exclusion prevents type guards from matching this type.
 */
export type ChunkFilterFn<CHUNK, PART extends { type: string }> = ((
  input: ChunkInput<CHUNK, PART>,
) => boolean) & { __brand?: never };

/**
 * Map function for chunk-based operations.
 * Returns transformed chunk(s) or null to remove.
 */
export type ChunkMapFn<
  UI_MESSAGE extends UIMessage,
  CHUNK extends InferUIMessageChunk<UI_MESSAGE>,
  PART extends { type: string },
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
 * Generic guard for filter() - carries pre-computed narrowed types.
 * Factory functions (includeChunks, includeParts, etc.) compute the types.
 * The __brand property distinguishes this from plain predicates.
 */
export type FilterGuard<
  UI_MESSAGE extends UIMessage,
  NARROWED_CHUNK extends InferUIMessageChunk<UI_MESSAGE>,
  NARROWED_PART extends { type: string },
> = {
  <T extends { chunk: InferUIMessageChunk<UI_MESSAGE>; part?: { type: string } | undefined }>(
    input: T,
  ): input is T & {
    chunk: NARROWED_CHUNK;
    part: NARROWED_PART;
  };
  /** @internal Type brand - never exists at runtime */
  readonly __brand: `FilterGuard`;
};

/**
 * Generic guard for on() - carries pre-computed narrowed types.
 * Part can be undefined for meta chunks.
 * The __brand property distinguishes this from plain predicates.
 */
export type OnGuard<
  UI_MESSAGE extends UIMessage,
  NARROWED_CHUNK extends InferUIMessageChunk<UI_MESSAGE>,
  NARROWED_PART extends { type: string } | undefined,
> = {
  <T extends { chunk: InferUIMessageChunk<UI_MESSAGE>; part?: { type: string } | undefined }>(
    input: T,
  ): input is T & {
    chunk: NARROWED_CHUNK;
    part: NARROWED_PART;
  };
  /** @internal Type brand - never exists at runtime */
  readonly __brand: `OnGuard`;
};
