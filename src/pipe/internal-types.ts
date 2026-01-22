import type { AsyncIterableStream, InferUIMessageChunk, UIMessage } from 'ai';
import type { InferUIMessagePart, InferUIMessagePartType } from '../types.js';
import type { ChunkTypeGuard } from './chunk-type.js';
import type { PartTypeGuard } from './part-type.js';
import type { ChunkPredicate, PartInput, PartPredicate } from './types.js';

/**
 * Internal chunk representation used within the pipeline.
 * Includes the original chunk and the part type (or undefined for meta chunks).
 */
export type InternalChunk<UI_MESSAGE extends UIMessage> = {
  chunk: InferUIMessageChunk<UI_MESSAGE>;
  partType: string | undefined;
};

/**
 * Builder function for ChunkPipeline operations.
 * Uses AsyncIterable instead of ReadableStream for deferred conversion.
 */
export type ChunkBuilder<UI_MESSAGE extends UIMessage> = (
  iterable: AsyncIterable<InternalChunk<UI_MESSAGE>>,
) => AsyncIterable<InternalChunk<UI_MESSAGE>>;

/**
 * Builder function for PartPipeline operations.
 * Uses InferUIMessagePart<UI_MESSAGE> to ensure covariance in the PART type parameter.
 */
export type PartBuilder<UI_MESSAGE extends UIMessage> = (
  iterable: AsyncIterable<PartInput<InferUIMessagePart<UI_MESSAGE>>>,
) => AsyncIterable<PartInput<InferUIMessagePart<UI_MESSAGE>>>;

/**
 * Union of all filter function types for ChunkPipeline/MatchPipeline.
 * Used in implementation signatures to accept predicates or type guards.
 */
export type ChunkFilterFn<
  UI_MESSAGE extends UIMessage,
  CHUNK extends InferUIMessageChunk<UI_MESSAGE>,
  PART extends InferUIMessagePart<UI_MESSAGE>,
> =
  | ChunkPredicate<CHUNK, PART>
  | PartTypeGuard<UI_MESSAGE, InferUIMessagePartType<UI_MESSAGE>>
  | ChunkTypeGuard<UI_MESSAGE, string>;

/**
 * Union of all filter function types for PartPipeline.
 * Used in implementation signatures to accept predicates or type guards.
 */
export type PartFilterFn<
  UI_MESSAGE extends UIMessage,
  PART extends InferUIMessagePart<UI_MESSAGE>,
> =
  | PartPredicate<PART>
  | PartTypeGuard<UI_MESSAGE, InferUIMessagePartType<UI_MESSAGE>>;

/**
 * Union of match predicate or type guard for ChunkPipeline.match().
 * Used in implementation signatures.
 */
export type MatchFilterFn<UI_MESSAGE extends UIMessage> =
  | ((input: { part: { type: string } }) => boolean)
  | PartTypeGuard<UI_MESSAGE, InferUIMessagePartType<UI_MESSAGE>>;

export interface BasePipeline<UI_MESSAGE extends UIMessage> {
  toStream(): AsyncIterableStream<InferUIMessageChunk<UI_MESSAGE>>;
}
