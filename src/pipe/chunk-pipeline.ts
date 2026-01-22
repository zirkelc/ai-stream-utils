import { convertAsyncIteratorToReadableStream } from '@ai-sdk/provider-utils';
import type { AsyncIterableStream, InferUIMessageChunk, UIMessage } from 'ai';
import { reduceUIMessageStream } from '../reduce-ui-message-stream.js';
import type {
  ExtractChunkForPart,
  ExtractPart,
  InferUIMessagePart,
  InferUIMessagePartType,
} from '../types.js';
import { createAsyncIterableStream } from '../utils/create-async-iterable-stream.js';
import { asArray } from '../utils/internal/stream-utils.js';
import type { ChunkTypeGuard } from './chunk-type.js';
import type {
  BasePipeline,
  ChunkBuilder,
  ChunkFilterFn,
  InternalChunk,
  MatchFilterFn,
} from './internal-types.js';
import { BUILDER, MatchPipeline } from './match-pipeline.js';
import { PartPipeline } from './part-pipeline.js';
import type { PartTypeGuard } from './part-type.js';
import type {
  ChunkInput,
  ChunkMapFn,
  ChunkPredicate,
  MatchPredicate,
  PartInput,
  ScanOperator,
} from './types.js';

/* ============================================================================
 * Match Result Type
 * ============================================================================ */

/**
 * Result type for match() handler - must return MatchPipeline.
 */
type MatchResult<
  UI_MESSAGE extends UIMessage,
  CHUNK extends InferUIMessageChunk<UI_MESSAGE>,
  PART extends InferUIMessagePart<UI_MESSAGE>,
> = MatchPipeline<UI_MESSAGE, CHUNK, PART>;

/* ============================================================================
 * ChunkPipeline Class
 * ============================================================================ */

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
