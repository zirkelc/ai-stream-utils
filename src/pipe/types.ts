import type { InferUIMessageChunk, UIMessage } from 'ai';
import type { InferUIMessagePart } from '../types.js';

/**
 * Input for chunk-based operations.
 * Part only contains the type field for performance - full part is not assembled.
 */
export type ChunkInput<CHUNK, PART extends { type: string }> = {
  chunk: CHUNK;
  part: Pick<PART, `type`>;
};

/**
 * Input for part-based operations (after reduce).
 */
export type PartInput<PART> = {
  part: PART;
  /** @internal Original chunks for serialization */
  chunks: unknown[];
};

/**
 * Predicate for chunk-based operations (filter, collect).
 * Returns true to include the chunk, false to exclude.
 */
export type ChunkPredicate<CHUNK, PART extends { type: string }> = (
  input: ChunkInput<CHUNK, PART>,
) => boolean;

/**
 * Predicate for part-based operations (PartPipeline.filter).
 * Returns true to include the part, false to exclude.
 */
export type PartPredicate<PART> = (input: PartInput<PART>) => boolean;

/**
 * Predicate for match operations (matches by part type).
 * Generic UI_MESSAGE parameter for future extensibility.
 * Uses `{ type: string }` for compatibility with internal string-based part tracking.
 */
export type MatchPredicate<_UI_MESSAGE extends UIMessage> = (input: {
  part: { type: string };
}) => boolean;

/**
 * Map function for chunk-based operations (MatchPipeline, ChunkPipeline).
 * Returns transformed chunk(s) or null to remove.
 */
export type ChunkMapFn<
  UI_MESSAGE extends UIMessage,
  CHUNK extends InferUIMessageChunk<UI_MESSAGE>,
  PART extends InferUIMessagePart<UI_MESSAGE>,
> = (
  input: ChunkInput<CHUNK, PART>,
) =>
  | InferUIMessageChunk<UI_MESSAGE>
  | Array<InferUIMessageChunk<UI_MESSAGE>>
  | null;

/**
 * Map function for part-based operations (PartPipeline).
 * Returns transformed part or null to remove.
 */
export type PartMapFn<PART> = (input: PartInput<PART>) => PART | null;

/**
 * Reusable scan operator object.
 * Encapsulates initial, reducer, and finalize functions for use with .scan().
 *
 * @example
 * ```typescript
 * const countingOperator: ScanOperator<MyUIMessage, { count: number }> = {
 *   initial: { count: 0 },
 *   reducer: (state, { chunk }) => {
 *     state.count++;
 *     return { ...chunk, delta: `[${state.count}]` };
 *   },
 * };
 * pipe.scan(countingOperator);
 * ```
 */
export type ScanOperator<
  UI_MESSAGE extends UIMessage,
  STATE,
  CHUNK extends
    InferUIMessageChunk<UI_MESSAGE> = InferUIMessageChunk<UI_MESSAGE>,
  PART extends InferUIMessagePart<UI_MESSAGE> = InferUIMessagePart<UI_MESSAGE>,
> = {
  initial: STATE | (() => STATE);
  reducer: (
    state: STATE,
    input: ChunkInput<CHUNK, PART>,
  ) =>
    | InferUIMessageChunk<UI_MESSAGE>
    | Array<InferUIMessageChunk<UI_MESSAGE>>
    | null;
  finalize?: (
    state: STATE,
  ) =>
    | InferUIMessageChunk<UI_MESSAGE>
    | Array<InferUIMessageChunk<UI_MESSAGE>>
    | null;
};
