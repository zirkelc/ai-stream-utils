import { convertAsyncIteratorToReadableStream } from '@ai-sdk/provider-utils';
import type { AsyncIterableStream, InferUIMessageChunk, UIMessage } from 'ai';
import { reduceUIMessageStream } from './reduce-ui-message-stream.js';
import type {
  ExtractChunkForPart,
  ExtractPart,
  InferUIMessagePart,
  InferUIMessagePartType,
} from './types.js';
import { createAsyncIterableStream } from './utils/create-async-iterable-stream.js';
import { fastReadUIMessageStream } from './utils/fast-read-ui-message-stream.js';
import {
  getPartTypeFromChunk,
  type ToolCallIdMap,
} from './utils/internal/get-part-type-from-chunk.js';
import { serializePartToChunks } from './utils/internal/serialize-part-to-chunks.js';
import {
  asArray,
  isStepEndChunk,
  isStepStartChunk,
} from './utils/internal/stream-utils.js';

/** @internal Symbol for accessing MatchPipeline builder */
const BUILDER = Symbol(`builder`);

/* ============================================================================
 * Pipeline Input Types
 * ============================================================================ */

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

/* ============================================================================
 * Internal Pipeline Representation
 * ============================================================================ */

/**
 * Internal chunk representation used within the pipeline.
 * Includes the original chunk and the part type (or undefined for meta chunks).
 */
type InternalChunk<UI_MESSAGE extends UIMessage> = {
  chunk: InferUIMessageChunk<UI_MESSAGE>;
  partType: string | undefined;
};

/**
 * Builder function for ChunkPipeline operations.
 * Uses AsyncIterable instead of ReadableStream for deferred conversion.
 */
type ChunkBuilder<UI_MESSAGE extends UIMessage> = (
  iterable: AsyncIterable<InternalChunk<UI_MESSAGE>>,
) => AsyncIterable<InternalChunk<UI_MESSAGE>>;

/* ============================================================================
 * Type Guard for Part Types
 * ============================================================================ */

/**
 * Type guard predicate for part types.
 * Used with `.filter()` and `.match()` to narrow types.
 * Generic T allows the guard to preserve other properties (like `chunk`) from the input.
 * The __brand property is used to distinguish from plain predicates (never actually exists at runtime).
 */
export type PartTypeGuard<
  UI_MESSAGE extends UIMessage,
  PART_TYPE extends InferUIMessagePartType<UI_MESSAGE>,
> = {
  <T extends { part: { type: string } }>(
    input: T,
  ): input is T & { part: { type: PART_TYPE } };
  /** @internal Type brand - never exists at runtime */
  readonly __brand: `PartTypeGuard`;
};

/**
 * Type guard predicate for chunk types.
 * Used with `.filter()` to narrow chunk types.
 * Generic T allows the guard to preserve other properties (like `part`) from the input.
 * The __brand property is used to distinguish from plain predicates (never actually exists at runtime).
 */
export type ChunkTypeGuard<
  UI_MESSAGE extends UIMessage,
  CHUNK_TYPE extends string,
> = {
  <T extends { chunk: InferUIMessageChunk<UI_MESSAGE> }>(
    input: T,
  ): input is T & {
    chunk: Extract<InferUIMessageChunk<UI_MESSAGE>, { type: CHUNK_TYPE }>;
  };
  /** @internal Type brand - never exists at runtime */
  readonly __brand: `ChunkTypeGuard`;
};

/* ============================================================================
 * Predicate Types
 * ============================================================================ */

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

/* ============================================================================
 * Map Function Types
 * ============================================================================ */

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

/* ============================================================================
 * Scan Operator Types
 * ============================================================================ */

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

/* ============================================================================
 * Filter Function Union Types (for implementation signatures)
 * ============================================================================ */

/**
 * Union of all filter function types for ChunkPipeline/MatchPipeline.
 * Used in implementation signatures to accept predicates or type guards.
 */
type ChunkFilterFn<
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
type PartFilterFn<
  UI_MESSAGE extends UIMessage,
  PART extends InferUIMessagePart<UI_MESSAGE>,
> =
  | PartPredicate<PART>
  | PartTypeGuard<UI_MESSAGE, InferUIMessagePartType<UI_MESSAGE>>;

/**
 * Union of match predicate or type guard for ChunkPipeline.match().
 * Used in implementation signatures.
 */
type MatchFilterFn<UI_MESSAGE extends UIMessage> =
  | MatchPredicate<UI_MESSAGE>
  | PartTypeGuard<UI_MESSAGE, InferUIMessagePartType<UI_MESSAGE>>;

/* ============================================================================
 * Part Builder Type
 * ============================================================================ */

/**
 * Builder function for PartPipeline operations.
 * Uses InferUIMessagePart<UI_MESSAGE> to ensure covariance in the PART type parameter.
 */
type PartBuilder<UI_MESSAGE extends UIMessage> = (
  iterable: AsyncIterable<PartInput<InferUIMessagePart<UI_MESSAGE>>>,
) => AsyncIterable<PartInput<InferUIMessagePart<UI_MESSAGE>>>;

/* ============================================================================
 * Base Pipeline Interface
 * ============================================================================ */

interface BasePipeline<UI_MESSAGE extends UIMessage> {
  toStream(): AsyncIterableStream<InferUIMessageChunk<UI_MESSAGE>>;
}

/* ============================================================================
 * MatchPipeline Class
 * ============================================================================ */

/**
 * Pipeline for match-specific operations.
 * A pure transform chain (filter/map composition).
 * Only supports filter() and map() - no reduce().
 */
export class MatchPipeline<
  UI_MESSAGE extends UIMessage,
  CHUNK extends InferUIMessageChunk<UI_MESSAGE>,
  PART extends InferUIMessagePart<UI_MESSAGE>,
> {
  /** @internal */
  [BUILDER]: ChunkBuilder<UI_MESSAGE>;

  constructor(builder: ChunkBuilder<UI_MESSAGE> = (s) => s) {
    this[BUILDER] = builder;
  }

  /**
   * Filter with part type guard - narrows both chunk and part types.
   */
  filter<PART_TYPE extends InferUIMessagePartType<UI_MESSAGE>>(
    guard: PartTypeGuard<UI_MESSAGE, PART_TYPE>,
  ): MatchPipeline<
    UI_MESSAGE,
    CHUNK & ExtractChunkForPart<UI_MESSAGE, ExtractPart<UI_MESSAGE, PART_TYPE>>,
    ExtractPart<UI_MESSAGE, PART_TYPE>
  >;

  /**
   * Filter with chunk type guard - narrows chunk type only.
   */
  filter<CHUNK_TYPE extends string>(
    guard: ChunkTypeGuard<UI_MESSAGE, CHUNK_TYPE>,
  ): MatchPipeline<
    UI_MESSAGE,
    Extract<InferUIMessageChunk<UI_MESSAGE>, { type: CHUNK_TYPE }>,
    PART
  >;

  /**
   * Filter with generic predicate.
   */
  filter(
    predicate: ChunkPredicate<CHUNK, PART>,
  ): MatchPipeline<UI_MESSAGE, CHUNK, PART>;

  filter(
    predicate: ChunkFilterFn<UI_MESSAGE, CHUNK, PART>,
  ): MatchPipeline<UI_MESSAGE, any, any> {
    const predicateFn = predicate as ChunkPredicate<CHUNK, PART>;

    const nextBuilder: ChunkBuilder<UI_MESSAGE> = (iterable) => {
      const prevIterable = this[BUILDER](iterable);

      async function* filterMatched(): AsyncGenerator<
        InternalChunk<UI_MESSAGE>
      > {
        for await (const item of prevIterable) {
          /** Meta chunks pass through (shouldn't happen in match context) */
          if (item.partType === undefined) {
            yield item;
            continue;
          }

          const input = {
            chunk: item.chunk,
            part: { type: item.partType },
          } as ChunkInput<CHUNK, PART>;

          if (predicateFn(input)) {
            yield item;
          }
        }
      }

      return filterMatched();
    };

    return new MatchPipeline(nextBuilder);
  }

  /**
   * Transform chunks.
   */
  map(
    fn: ChunkMapFn<UI_MESSAGE, CHUNK, PART>,
  ): MatchPipeline<UI_MESSAGE, CHUNK, PART> {
    const nextBuilder: ChunkBuilder<UI_MESSAGE> = (iterable) => {
      const prevIterable = this[BUILDER](iterable);

      async function* mapMatched(): AsyncGenerator<InternalChunk<UI_MESSAGE>> {
        for await (const item of prevIterable) {
          /** Meta chunks pass through (shouldn't happen in match context) */
          if (item.partType === undefined) {
            yield item;
            continue;
          }

          const input = {
            chunk: item.chunk,
            part: { type: item.partType },
          } as ChunkInput<CHUNK, PART>;

          const result = fn(input);
          const chunks = asArray(result);

          for (const chunk of chunks) {
            yield { chunk, partType: item.partType };
          }
        }
      }

      return mapMatched();
    };

    return new MatchPipeline(nextBuilder);
  }
}

/* ============================================================================
 * PartPipeline Class
 * ============================================================================ */

/**
 * Pipeline for part-based operations (after reduce()).
 * Operations receive complete parts instead of individual chunks.
 */
export class PartPipeline<
  UI_MESSAGE extends UIMessage,
  PART extends InferUIMessagePart<UI_MESSAGE>,
> implements
    BasePipeline<UI_MESSAGE>,
    AsyncIterable<InferUIMessageChunk<UI_MESSAGE>>
{
  private consumed = false;

  constructor(
    private sourceIterable: AsyncIterable<
      PartInput<InferUIMessagePart<UI_MESSAGE>>
    >,
    private prevBuilder: PartBuilder<UI_MESSAGE> = (s) => s,
  ) {}

  private assertNotConsumed(): void {
    if (this.consumed) {
      throw new Error('Pipeline has already been consumed.');
    }
  }

  /**
   * Filter parts by part type guard.
   */
  filter<PART_TYPE extends InferUIMessagePartType<UI_MESSAGE>>(
    guard: PartTypeGuard<UI_MESSAGE, PART_TYPE>,
  ): PartPipeline<UI_MESSAGE, PART & ExtractPart<UI_MESSAGE, PART_TYPE>>;
  /**
   * Filter parts by predicate.
   */
  filter(predicate: PartPredicate<PART>): PartPipeline<UI_MESSAGE, PART>;

  filter(
    predicate: PartFilterFn<UI_MESSAGE, PART>,
  ): PartPipeline<UI_MESSAGE, PART> {
    /** Cast predicate to work with full part type */
    const predicateFn = predicate as PartPredicate<
      InferUIMessagePart<UI_MESSAGE>
    >;

    const nextBuilder: PartBuilder<UI_MESSAGE> = (iterable) => {
      const prevIterable = this.prevBuilder(iterable);

      async function* filterParts(): AsyncGenerator<
        PartInput<InferUIMessagePart<UI_MESSAGE>>
      > {
        for await (const partInput of prevIterable) {
          if (predicateFn(partInput)) {
            yield partInput;
          }
        }
      }

      return filterParts();
    };

    return new PartPipeline<UI_MESSAGE, PART>(this.sourceIterable, nextBuilder);
  }

  /**
   * Transform parts.
   */
  map(fn: PartMapFn<PART>): PartPipeline<UI_MESSAGE, PART> {
    /** Cast fn to work with full part type */
    const mapFn = fn as (
      input: PartInput<InferUIMessagePart<UI_MESSAGE>>,
    ) => InferUIMessagePart<UI_MESSAGE> | null;

    const nextBuilder: PartBuilder<UI_MESSAGE> = (iterable) => {
      const prevIterable = this.prevBuilder(iterable);

      async function* mapParts(): AsyncGenerator<
        PartInput<InferUIMessagePart<UI_MESSAGE>>
      > {
        for await (const input of prevIterable) {
          const result = mapFn(input);
          if (result !== null) {
            yield {
              part: result,
              chunks: input.chunks,
            };
          }
        }
      }

      return mapParts();
    };

    return new PartPipeline<UI_MESSAGE, PART>(this.sourceIterable, nextBuilder);
  }

  /**
   * Execute the pipeline and return the resulting chunk stream.
   */
  toStream(): AsyncIterableStream<InferUIMessageChunk<UI_MESSAGE>> {
    this.assertNotConsumed();
    this.consumed = true;

    const partsIterable = this.prevBuilder(
      this.sourceIterable,
    ) as AsyncIterable<PartInput<PART>>;

    async function* emitChunks(): AsyncGenerator<
      InferUIMessageChunk<UI_MESSAGE>
    > {
      for await (const partInput of partsIterable) {
        const chunks = serializePartToChunks<UI_MESSAGE>(
          partInput.part,
          partInput.chunks as InferUIMessageChunk<UI_MESSAGE>[],
        );
        for (const chunk of chunks) {
          yield chunk;
        }
      }
    }

    const outputStream = convertAsyncIteratorToReadableStream(emitChunks());

    return createAsyncIterableStream(outputStream);
  }

  [Symbol.asyncIterator](): AsyncIterator<InferUIMessageChunk<UI_MESSAGE>> {
    return this.toStream()[Symbol.asyncIterator]();
  }
}

/* ============================================================================
 * ChunkPipeline Class
 * ============================================================================ */

/**
 * Result type for match() handler - must return MatchPipeline.
 */
type MatchResult<
  UI_MESSAGE extends UIMessage,
  CHUNK extends InferUIMessageChunk<UI_MESSAGE>,
  PART extends InferUIMessagePart<UI_MESSAGE>,
> = MatchPipeline<UI_MESSAGE, CHUNK, PART>;

/**
 * Pipeline for chunk-based operations (default).
 * Operations receive individual chunks with their associated part type.
 */
export class ChunkPipeline<
  UI_MESSAGE extends UIMessage,
  CHUNK extends InferUIMessageChunk<UI_MESSAGE>,
  PART extends InferUIMessagePart<UI_MESSAGE>,
> implements
    BasePipeline<UI_MESSAGE>,
    AsyncIterable<InferUIMessageChunk<UI_MESSAGE>>
{
  private consumed = false;

  constructor(
    private sourceIterable: AsyncIterable<InternalChunk<UI_MESSAGE>>,
    private prevBuilder: ChunkBuilder<UI_MESSAGE> = (s) => s,
  ) {}

  private assertNotConsumed(): void {
    if (this.consumed) {
      throw new Error(`Pipeline has already been consumed.`);
    }
  }

  /* --------------------------------------------------------------------------
   * filter() - Remove non-matching chunks
   * -------------------------------------------------------------------------- */

  /**
   * Filter with part type guard - narrows both chunk and part types.
   */
  filter<PART_TYPE extends InferUIMessagePartType<UI_MESSAGE>>(
    guard: PartTypeGuard<UI_MESSAGE, PART_TYPE>,
  ): ChunkPipeline<
    UI_MESSAGE,
    CHUNK & ExtractChunkForPart<UI_MESSAGE, ExtractPart<UI_MESSAGE, PART_TYPE>>,
    ExtractPart<UI_MESSAGE, PART_TYPE>
  >;

  /**
   * Filter with chunk type guard - narrows chunk type only.
   */
  filter<CHUNK_TYPE extends string>(
    guard: ChunkTypeGuard<UI_MESSAGE, CHUNK_TYPE>,
  ): ChunkPipeline<
    UI_MESSAGE,
    Extract<InferUIMessageChunk<UI_MESSAGE>, { type: CHUNK_TYPE }>,
    PART
  >;

  /**
   * Filter with generic predicate.
   */
  filter(
    predicate: ChunkPredicate<CHUNK, PART>,
  ): ChunkPipeline<UI_MESSAGE, CHUNK, PART>;

  filter(
    predicate: ChunkFilterFn<UI_MESSAGE, CHUNK, PART>,
  ): ChunkPipeline<UI_MESSAGE, any, any> {
    /** Cast to simple function type for runtime */
    const predicateFn = predicate as ChunkPredicate<CHUNK, PART>;

    const nextBuilder: ChunkBuilder<UI_MESSAGE> = (iterable) => {
      const prevIterable = this.prevBuilder(iterable);

      async function* filterChunks(): AsyncGenerator<
        InternalChunk<UI_MESSAGE>
      > {
        for await (const item of prevIterable) {
          /** Meta chunks always pass through */
          if (item.partType === undefined) {
            yield item;
            continue;
          }

          /** Apply predicate */
          const input = {
            chunk: item.chunk,
            part: { type: item.partType },
          } as ChunkInput<CHUNK, PART>;

          if (predicateFn(input)) {
            yield item;
          }
        }
      }

      return filterChunks();
    };

    return new ChunkPipeline(this.sourceIterable, nextBuilder);
  }

  /* --------------------------------------------------------------------------
   * map() - Transform chunks
   * -------------------------------------------------------------------------- */

  /**
   * Transform chunks.
   */
  map(
    fn: ChunkMapFn<UI_MESSAGE, CHUNK, PART>,
  ): ChunkPipeline<UI_MESSAGE, CHUNK, PART> {
    const nextBuilder: ChunkBuilder<UI_MESSAGE> = (iterable) => {
      const prevIterable = this.prevBuilder(iterable);

      async function* mapChunks(): AsyncGenerator<InternalChunk<UI_MESSAGE>> {
        for await (const item of prevIterable) {
          /** Meta chunks always pass through unchanged */
          if (item.partType === undefined) {
            yield item;
            continue;
          }

          /** Apply transform */
          const input = {
            chunk: item.chunk,
            part: { type: item.partType },
          } as ChunkInput<CHUNK, PART>;

          const result = fn(input);
          const chunks = asArray(result);

          for (const chunk of chunks) {
            yield { chunk, partType: item.partType };
          }
        }
      }

      return mapChunks();
    };

    return new ChunkPipeline<UI_MESSAGE, CHUNK, PART>(
      this.sourceIterable,
      nextBuilder,
    );
  }

  /* --------------------------------------------------------------------------
   * scan() - Stateful accumulator
   * -------------------------------------------------------------------------- */

  /**
   * Stateful accumulator with custom emission logic using a ScanOperator object.
   *
   * @example
   * ```typescript
   * pipe.scan(smoothStreaming())
   * pipe.scan(smoothStreaming({ pattern: /[.!?]\s+/m }))
   * pipe.scan({
   *   initial: { count: 0 },
   *   reducer: (state, { chunk }) => {
   *     state.count++;
   *     return { ...chunk, delta: `[${state.count}] ${chunk.delta}` };
   *   },
   * })
   * ```
   */
  scan<STATE>(
    operator: ScanOperator<UI_MESSAGE, STATE, CHUNK, PART>,
  ): ChunkPipeline<UI_MESSAGE, CHUNK, PART> {
    const { initial, reducer, finalize } = operator;

    const nextBuilder: ChunkBuilder<UI_MESSAGE> = (iterable) => {
      const prevIterable = this.prevBuilder(iterable);

      async function* scanChunks(): AsyncGenerator<InternalChunk<UI_MESSAGE>> {
        const state =
          typeof initial === `function` ? (initial as () => STATE)() : initial;
        let lastPartType: string | undefined;

        for await (const item of prevIterable) {
          /** Meta chunks pass through unchanged */
          if (item.partType === undefined) {
            yield item;
            continue;
          }

          lastPartType = item.partType;

          const input = {
            chunk: item.chunk,
            part: { type: item.partType },
          } as ChunkInput<CHUNK, PART>;

          const result = reducer(state, input);
          const chunks = asArray(result);

          for (const chunk of chunks) {
            yield { chunk, partType: item.partType };
          }
        }

        /** Final finalize at stream end */
        if (finalize && lastPartType !== undefined) {
          const flushed = asArray(finalize(state));
          for (const chunk of flushed) {
            yield { chunk, partType: lastPartType };
          }
        }
      }

      return scanChunks();
    };

    return new ChunkPipeline<UI_MESSAGE, CHUNK, PART>(
      this.sourceIterable,
      nextBuilder,
    );
  }

  /* --------------------------------------------------------------------------
   * match() - Process matching parts in sub-pipeline
   * -------------------------------------------------------------------------- */

  /**
   * Match specific part types and process them in a sub-pipeline.
   * Non-matching chunks pass through unchanged.
   *
   * @overload With PartTypeGuard (created by partType()) - provides type narrowing
   * @overload With plain predicate - no type narrowing, sub-pipeline has full types
   */
  match<PART_TYPE extends InferUIMessagePartType<UI_MESSAGE>>(
    predicate: PartTypeGuard<UI_MESSAGE, PART_TYPE>,
    handler: (
      subPipeline: MatchPipeline<
        UI_MESSAGE,
        ExtractChunkForPart<UI_MESSAGE, ExtractPart<UI_MESSAGE, PART_TYPE>>,
        ExtractPart<UI_MESSAGE, PART_TYPE>
      >,
    ) => MatchResult<
      UI_MESSAGE,
      ExtractChunkForPart<UI_MESSAGE, ExtractPart<UI_MESSAGE, PART_TYPE>>,
      ExtractPart<UI_MESSAGE, PART_TYPE>
    >,
  ): ChunkPipeline<UI_MESSAGE, CHUNK, PART>;
  match(
    predicate: MatchPredicate<UI_MESSAGE>,
    handler: (
      subPipeline: MatchPipeline<
        UI_MESSAGE,
        InferUIMessageChunk<UI_MESSAGE>,
        InferUIMessagePart<UI_MESSAGE>
      >,
    ) => MatchResult<
      UI_MESSAGE,
      InferUIMessageChunk<UI_MESSAGE>,
      InferUIMessagePart<UI_MESSAGE>
    >,
  ): ChunkPipeline<UI_MESSAGE, CHUNK, PART>;

  match<PART_TYPE extends InferUIMessagePartType<UI_MESSAGE>>(
    predicate: MatchFilterFn<UI_MESSAGE>,
    handler: (
      subPipeline: MatchPipeline<UI_MESSAGE, any, any>,
    ) => MatchResult<UI_MESSAGE, any, any>,
  ): ChunkPipeline<UI_MESSAGE, CHUNK, PART> {
    const subPipeline = new MatchPipeline<
      UI_MESSAGE,
      ExtractChunkForPart<UI_MESSAGE, ExtractPart<UI_MESSAGE, PART_TYPE>>,
      ExtractPart<UI_MESSAGE, PART_TYPE>
    >();

    const result = handler(subPipeline);
    const subPipelineBuilder = result[BUILDER];
    const pred = predicate as MatchPredicate<UI_MESSAGE>;

    const nextBuilder: ChunkBuilder<UI_MESSAGE> = (iterable) => {
      const prevIterable = this.prevBuilder(iterable);

      async function* generateMatched(): AsyncGenerator<
        InternalChunk<UI_MESSAGE>
      > {
        for await (const item of prevIterable) {
          if (item.partType === undefined) {
            /** Meta chunks pass through */
            yield item;
          } else if (pred({ part: { type: item.partType } })) {
            /** Apply transform to matching chunk */
            const singleItemIterable = (async function* () {
              yield item;
            })();
            for await (const transformed of subPipelineBuilder(
              singleItemIterable,
            )) {
              yield transformed;
            }
          } else {
            /** Non-matching pass through */
            yield item;
          }
        }
      }

      return generateMatched();
    };

    return new ChunkPipeline<UI_MESSAGE, CHUNK, PART>(
      this.sourceIterable,
      nextBuilder,
    );
  }

  /* --------------------------------------------------------------------------
   * reduce() - Transform to PartPipeline
   * -------------------------------------------------------------------------- */

  /**
   * Reduce chunks to complete parts.
   */
  reduce(): PartPipeline<UI_MESSAGE, PART> {
    const prevBuilder = this.prevBuilder;
    const sourceIterable = this.sourceIterable;

    /** Extract chunks from internal iterable representation */
    async function* generateRawChunks(): AsyncGenerator<
      InferUIMessageChunk<UI_MESSAGE>
    > {
      for await (const item of prevBuilder(sourceIterable)) {
        yield item.chunk;
      }
    }

    const rawChunkStream = convertAsyncIteratorToReadableStream(
      generateRawChunks(),
    );

    /** Call reduceUIMessageStream eagerly - this is the only place that needs a stream */
    const reducedIterable = reduceUIMessageStream<UI_MESSAGE>(
      rawChunkStream,
    ) as AsyncIterable<PartInput<PART>>;

    return new PartPipeline<UI_MESSAGE, PART>(reducedIterable, (s) => s);
  }

  /* --------------------------------------------------------------------------
   * Terminal operations
   * -------------------------------------------------------------------------- */

  /**
   * Execute the pipeline and return the resulting stream.
   */
  toStream(): AsyncIterableStream<InferUIMessageChunk<UI_MESSAGE>> {
    this.assertNotConsumed();
    this.consumed = true;

    const processedIterable = this.prevBuilder(this.sourceIterable);

    async function* emitChunks(): AsyncGenerator<
      InferUIMessageChunk<UI_MESSAGE>
    > {
      for await (const item of processedIterable) {
        if (item.partType !== undefined) {
          yield item.chunk;
        }
      }
    }

    const outputStream = convertAsyncIteratorToReadableStream(emitChunks());

    return createAsyncIterableStream(outputStream);
  }

  [Symbol.asyncIterator](): AsyncIterator<InferUIMessageChunk<UI_MESSAGE>> {
    return this.toStream()[Symbol.asyncIterator]();
  }
}

/* ============================================================================
 * Internal Stream Creation
 * ============================================================================ */

/**
 * Creates an internal iterable with part type information from a raw chunk stream.
 * Handles step boundaries (buffering start-step) and meta chunks.
 *
 * Part type is derived directly from the chunk's type rather than from message.parts[-1],
 * which ensures correct association when chunks from different part types are interleaved.
 */
function createInternalIterable<UI_MESSAGE extends UIMessage>(
  stream: ReadableStream<InferUIMessageChunk<UI_MESSAGE>>,
): AsyncIterable<InternalChunk<UI_MESSAGE>> {
  /** Buffered start-step chunk. Only emitted if content follows. */
  let bufferedStartStep: InferUIMessageChunk<UI_MESSAGE> | undefined;
  /** Tracks if start-step was emitted, so we know to emit the matching finish-step. */
  let stepStartEmitted = false;
  /** Tracks toolCallId → partType mapping for tool chunks */
  const toolCallIdMap: ToolCallIdMap = {};

  async function* generateSourceChunks(): AsyncGenerator<
    InternalChunk<UI_MESSAGE>
  > {
    for await (const { chunk } of fastReadUIMessageStream<UI_MESSAGE>(stream)) {
      /** Buffer start-step instead of emitting immediately */
      if (isStepStartChunk(chunk)) {
        bufferedStartStep = chunk;
        continue;
      }

      /** Step is ending. Only emit if we emitted the corresponding start-step */
      if (isStepEndChunk(chunk)) {
        if (stepStartEmitted) {
          yield { chunk, partType: undefined };
          stepStartEmitted = false;
        }
        bufferedStartStep = undefined;
        continue;
      }

      /** Derive part type from chunk type (undefined for meta chunks) */
      const partType = getPartTypeFromChunk<UI_MESSAGE>(chunk, toolCallIdMap);

      /** Meta chunks pass through with undefined partType */
      if (partType === undefined) {
        yield { chunk, partType: undefined };
        continue;
      }

      /** Content chunk - emit buffered start-step first if present */
      if (bufferedStartStep) {
        yield { chunk: bufferedStartStep, partType: undefined };
        stepStartEmitted = true;
        bufferedStartStep = undefined;
      }

      yield { chunk, partType };
    }
  }

  return generateSourceChunks();
}

/* ============================================================================
 * Entry Point
 * ============================================================================ */

/**
 * Creates a type-safe pipeline for UIMessageStream operations.
 *
 * @example
 * ```typescript
 * pipeUIMessageStream<MyUIMessage>(stream)
 *   .filter(partType('text'))
 *   .map(({ chunk }) => chunk)
 *   .toStream();
 * ```
 */
export function pipeUIMessageStream<UI_MESSAGE extends UIMessage>(
  stream: ReadableStream<InferUIMessageChunk<UI_MESSAGE>>,
): ChunkPipeline<
  UI_MESSAGE,
  InferUIMessageChunk<UI_MESSAGE>,
  InferUIMessagePart<UI_MESSAGE>
> {
  /** Create internal iterable with part type information */
  const sourceIterable = createInternalIterable<UI_MESSAGE>(stream);
  return new ChunkPipeline(sourceIterable);
}

/* ============================================================================
 * Helper Functions
 * ============================================================================ */

/**
 * Creates a type guard that narrows by part type.
 * Use with `.filter()` and `.match()`.
 *
 * @example
 * ```typescript
 * // Filter by part type
 * pipeUIMessageStream<MyUIMessage>(stream)
 *   .filter(partType('text', 'reasoning'))
 *   .map(({ chunk, part }) => chunk);
 *
 * // Match specific part types
 * pipeUIMessageStream<MyUIMessage>(stream)
 *   .match(partType('text'), (pipe) =>
 *     pipe.map(({ chunk }) => chunk)
 *   );
 * ```
 */
export function partType<
  UI_MESSAGE extends UIMessage,
  PART_TYPE extends InferUIMessagePartType<UI_MESSAGE>,
>(...types: PART_TYPE[]): PartTypeGuard<UI_MESSAGE, PART_TYPE> {
  const guard = <T extends { part: InferUIMessagePart<UI_MESSAGE> }>(
    input: T,
  ): input is T & { part: ExtractPart<UI_MESSAGE, PART_TYPE> } =>
    (types as string[]).includes((input.part as { type: string }).type);

  return guard as PartTypeGuard<UI_MESSAGE, PART_TYPE>;
}

/**
 * Creates a type guard that narrows by chunk type.
 * Use with `.filter()`.
 *
 * @example
 * ```typescript
 * pipeUIMessageStream<MyUIMessage>(stream)
 *   .filter(chunkType('text-delta'))
 *   .map(({ chunk }) => chunk); // chunk is narrowed to text-delta chunk
 * ```
 */
export function chunkType<
  UI_MESSAGE extends UIMessage,
  CHUNK_TYPE extends string,
>(...types: CHUNK_TYPE[]): ChunkTypeGuard<UI_MESSAGE, CHUNK_TYPE> {
  const guard = <T extends { chunk: InferUIMessageChunk<UI_MESSAGE> }>(
    input: T,
  ): input is T & {
    chunk: Extract<InferUIMessageChunk<UI_MESSAGE>, { type: CHUNK_TYPE }>;
  } => (types as string[]).includes((input.chunk as { type: string }).type);

  return guard as ChunkTypeGuard<UI_MESSAGE, CHUNK_TYPE>;
}
