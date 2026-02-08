import { convertAsyncIteratorToReadableStream } from "@ai-sdk/provider-utils";
import type { AsyncIterableStream, InferUIMessageChunk, UIMessage } from "ai";
import { asArray } from "../internal/utils.js";
// import { reduceUIMessageStream } from '../reduce-ui-message-stream.js';
import type {
  ChunkTypeToPartType,
  ExtractChunkForPart,
  ExtractPart,
  InferUIMessagePart,
  InferUIMessagePartType,
} from "../types.js";
import { createAsyncIterableStream } from "../utils/create-async-iterable-stream.js";
import type { BasePipeline, InternalChunk } from "./base-pipeline.js";
import type { ChunkTypeGuard } from "./chunk-type.js";
// import { BUILDER, MatchPipeline } from './match-pipeline.js';
// import { PartPipeline } from './part-pipeline.js';
import type { PartTypeGuard } from "./part-type.js";

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
 */
export type ChunkPredicate<CHUNK, PART extends { type: string }> = (
  input: ChunkInput<CHUNK, PART>,
) => boolean;

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
) => InferUIMessageChunk<UI_MESSAGE> | Array<InferUIMessageChunk<UI_MESSAGE>> | null;

// /**
//  * Reusable scan operator object.
//  * Encapsulates initial, reducer, and finalize functions for use with .scan().
//  *
//  * @example
//  * ```typescript
//  * const countingOperator: ScanOperator<MyUIMessage, { count: number }> = {
//  *   initial: { count: 0 },
//  *   reducer: (state, { chunk }) => {
//  *     state.count++;
//  *     return { ...chunk, delta: `[${state.count}]` };
//  *   },
//  * };
//  * pipe.scan(countingOperator);
//  * ```
//  */
// export type ScanOperator<
//   UI_MESSAGE extends UIMessage,
//   STATE,
//   CHUNK extends InferUIMessageChunk<UI_MESSAGE> = InferUIMessageChunk<UI_MESSAGE>,
//   PART extends InferUIMessagePart<UI_MESSAGE> = InferUIMessagePart<UI_MESSAGE>,
// > = {
//   initial: STATE | (() => STATE);
//   reducer: (
//     state: STATE,
//     input: ChunkInput<CHUNK, PART>,
//   ) => InferUIMessageChunk<UI_MESSAGE> | Array<InferUIMessageChunk<UI_MESSAGE>> | null;
//   finalize?: (
//     state: STATE,
//   ) => InferUIMessageChunk<UI_MESSAGE> | Array<InferUIMessageChunk<UI_MESSAGE>> | null;
// };

/**
 * Builder function for ChunkPipeline operations.
 * Uses AsyncIterable instead of ReadableStream for deferred conversion.
 */
export type ChunkBuilder<UI_MESSAGE extends UIMessage> = (
  iterable: AsyncIterable<InternalChunk<UI_MESSAGE>>,
) => AsyncIterable<InternalChunk<UI_MESSAGE>>;

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
 * Union of match predicate or type guard for ChunkPipeline.match().
 * Used in implementation signatures.
 */
// export type MatchFilterFn<UI_MESSAGE extends UIMessage> =
//   | ((input: { part: { type: string } }) => boolean)
//   | PartTypeGuard<UI_MESSAGE, InferUIMessagePartType<UI_MESSAGE>>;

// /**
//  * Result type for match() handler - must return MatchPipeline.
//  */
// type MatchResult<
//   UI_MESSAGE extends UIMessage,
//   CHUNK extends InferUIMessageChunk<UI_MESSAGE>,
//   PART extends InferUIMessagePart<UI_MESSAGE>,
// > = MatchPipeline<UI_MESSAGE, CHUNK, PART>;

/**
 * Pipeline for chunk-based operations (default).
 * Operations receive individual chunks with their associated part type.
 */
export class ChunkPipeline<
  UI_MESSAGE extends UIMessage,
  CHUNK extends InferUIMessageChunk<UI_MESSAGE>,
  PART extends InferUIMessagePart<UI_MESSAGE>,
>
  implements BasePipeline<UI_MESSAGE>, AsyncIterable<InferUIMessageChunk<UI_MESSAGE>>
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
   * Filter with chunk type guard - narrows both chunk and part types.
   */
  filter<CHUNK_TYPE extends string>(
    guard: ChunkTypeGuard<UI_MESSAGE, CHUNK_TYPE>,
  ): ChunkPipeline<
    UI_MESSAGE,
    Extract<InferUIMessageChunk<UI_MESSAGE>, { type: CHUNK_TYPE }>,
    ExtractPart<UI_MESSAGE, ChunkTypeToPartType<UI_MESSAGE, CHUNK_TYPE>>
  >;

  /**
   * Filter with generic predicate.
   */
  filter(predicate: ChunkPredicate<CHUNK, PART>): ChunkPipeline<UI_MESSAGE, CHUNK, PART>;

  filter(predicate: ChunkFilterFn<UI_MESSAGE, CHUNK, PART>): ChunkPipeline<UI_MESSAGE, any, any> {
    /** Cast to simple function type for runtime */
    const predicateFn = predicate as ChunkPredicate<CHUNK, PART>;

    const nextBuilder: ChunkBuilder<UI_MESSAGE> = (iterable) => {
      const prevIterable = this.prevBuilder(iterable);

      async function* filterChunks(): AsyncGenerator<InternalChunk<UI_MESSAGE>> {
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

  /**
   * Transform chunks.
   */
  map(fn: ChunkMapFn<UI_MESSAGE, CHUNK, PART>): ChunkPipeline<UI_MESSAGE, CHUNK, PART> {
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

    return new ChunkPipeline<UI_MESSAGE, CHUNK, PART>(this.sourceIterable, nextBuilder);
  }

  // /**
  //  * Stateful accumulator with custom emission logic using a ScanOperator object.
  //  *
  //  * @example
  //  * ```typescript
  //  * pipe.scan(smoothStreaming())
  //  * pipe.scan(smoothStreaming({ pattern: /[.!?]\s+/m }))
  //  * pipe.scan({
  //  *   initial: { count: 0 },
  //  *   reducer: (state, { chunk }) => {
  //  *     state.count++;
  //  *     return { ...chunk, delta: `[${state.count}] ${chunk.delta}` };
  //  *   },
  //  * })
  //  * ```
  //  */
  // scan<STATE>(
  //   operator: ScanOperator<UI_MESSAGE, STATE, CHUNK, PART>,
  // ): ChunkPipeline<UI_MESSAGE, CHUNK, PART> {
  //   const { initial, reducer, finalize } = operator;

  //   const nextBuilder: ChunkBuilder<UI_MESSAGE> = (iterable) => {
  //     const prevIterable = this.prevBuilder(iterable);

  //     async function* scanChunks(): AsyncGenerator<InternalChunk<UI_MESSAGE>> {
  //       const state = typeof initial === `function` ? (initial as () => STATE)() : initial;
  //       let lastPartType: string | undefined;

  //       for await (const item of prevIterable) {
  //         /** Meta chunks pass through unchanged */
  //         if (item.partType === undefined) {
  //           yield item;
  //           continue;
  //         }

  //         lastPartType = item.partType;

  //         const input = {
  //           chunk: item.chunk,
  //           part: { type: item.partType },
  //         } as ChunkInput<CHUNK, PART>;

  //         const result = reducer(state, input);
  //         const chunks = asArray(result);

  //         for (const chunk of chunks) {
  //           yield { chunk, partType: item.partType };
  //         }
  //       }

  //       /** Final finalize at stream end */
  //       if (finalize && lastPartType !== undefined) {
  //         const flushed = asArray(finalize(state));
  //         for (const chunk of flushed) {
  //           yield { chunk, partType: lastPartType };
  //         }
  //       }
  //     }

  //     return scanChunks();
  //   };

  //   return new ChunkPipeline<UI_MESSAGE, CHUNK, PART>(this.sourceIterable, nextBuilder);
  // }

  // /**
  //  * Match specific part types and process them in a sub-pipeline.
  //  * Non-matching chunks pass through unchanged.
  //  *
  //  * @overload With PartTypeGuard (created by isPartType()) - provides type narrowing
  //  * @overload With plain predicate - no type narrowing, sub-pipeline has full types
  //  */
  // match<PART_TYPE extends InferUIMessagePartType<UI_MESSAGE>>(
  //   predicate: PartTypeGuard<UI_MESSAGE, PART_TYPE>,
  //   handler: (
  //     subPipeline: MatchPipeline<
  //       UI_MESSAGE,
  //       ExtractChunkForPart<UI_MESSAGE, ExtractPart<UI_MESSAGE, PART_TYPE>>,
  //       ExtractPart<UI_MESSAGE, PART_TYPE>
  //     >,
  //   ) => MatchResult<
  //     UI_MESSAGE,
  //     ExtractChunkForPart<UI_MESSAGE, ExtractPart<UI_MESSAGE, PART_TYPE>>,
  //     ExtractPart<UI_MESSAGE, PART_TYPE>
  //   >,
  // ): ChunkPipeline<UI_MESSAGE, CHUNK, PART>;
  // match(
  //   predicate: MatchPredicate<UI_MESSAGE>,
  //   handler: (
  //     subPipeline: MatchPipeline<
  //       UI_MESSAGE,
  //       InferUIMessageChunk<UI_MESSAGE>,
  //       InferUIMessagePart<UI_MESSAGE>
  //     >,
  //   ) => MatchResult<
  //     UI_MESSAGE,
  //     InferUIMessageChunk<UI_MESSAGE>,
  //     InferUIMessagePart<UI_MESSAGE>
  //   >,
  // ): ChunkPipeline<UI_MESSAGE, CHUNK, PART>;

  // match<PART_TYPE extends InferUIMessagePartType<UI_MESSAGE>>(
  //   predicate: MatchFilterFn<UI_MESSAGE>,
  //   handler: (
  //     subPipeline: MatchPipeline<UI_MESSAGE, any, any>,
  //   ) => MatchResult<UI_MESSAGE, any, any>,
  // ): ChunkPipeline<UI_MESSAGE, CHUNK, PART> {
  //   const subPipeline = new MatchPipeline<
  //     UI_MESSAGE,
  //     ExtractChunkForPart<UI_MESSAGE, ExtractPart<UI_MESSAGE, PART_TYPE>>,
  //     ExtractPart<UI_MESSAGE, PART_TYPE>
  //   >();

  //   const result = handler(subPipeline);
  //   const subPipelineBuilder = result[BUILDER];
  //   const pred = predicate as MatchPredicate<UI_MESSAGE>;

  //   const nextBuilder: ChunkBuilder<UI_MESSAGE> = (iterable) => {
  //     const prevIterable = this.prevBuilder(iterable);

  //     async function* generateMatched(): AsyncGenerator<
  //       InternalChunk<UI_MESSAGE>
  //     > {
  //       for await (const item of prevIterable) {
  //         if (item.partType === undefined) {
  //           /** Meta chunks pass through */
  //           yield item;
  //         } else if (pred({ part: { type: item.partType } })) {
  //           /** Apply transform to matching chunk */
  //           const singleItemIterable = (async function* () {
  //             yield item;
  //           })();
  //           for await (const transformed of subPipelineBuilder(
  //             singleItemIterable,
  //           )) {
  //             yield transformed;
  //           }
  //         } else {
  //           /** Non-matching pass through */
  //           yield item;
  //         }
  //       }
  //     }

  //     return generateMatched();
  //   };

  //   return new ChunkPipeline<UI_MESSAGE, CHUNK, PART>(
  //     this.sourceIterable,
  //     nextBuilder,
  //   );
  // }

  // /**
  //  * Reduce chunks to complete parts.
  //  */
  // reduce(): PartPipeline<UI_MESSAGE, PART> {
  //   const prevBuilder = this.prevBuilder;
  //   const sourceIterable = this.sourceIterable;

  //   /** Extract chunks from internal iterable representation */
  //   async function* generateRawChunks(): AsyncGenerator<
  //     InferUIMessageChunk<UI_MESSAGE>
  //   > {
  //     for await (const item of prevBuilder(sourceIterable)) {
  //       yield item.chunk;
  //     }
  //   }

  //   const rawChunkStream = convertAsyncIteratorToReadableStream(
  //     generateRawChunks(),
  //   );

  //   /** Call reduceUIMessageStream eagerly - this is the only place that needs a stream */
  //   const reducedIterable = reduceUIMessageStream<UI_MESSAGE>(
  //     rawChunkStream,
  //   ) as AsyncIterable<PartInput<PART>>;

  //   return new PartPipeline<UI_MESSAGE, PART>(reducedIterable, (s) => s);
  // }

  /**
   * Execute the pipeline and return the resulting stream.
   * All chunks pass through, including step boundaries and meta chunks.
   */
  toStream(): AsyncIterableStream<InferUIMessageChunk<UI_MESSAGE>> {
    this.assertNotConsumed();
    this.consumed = true;

    const processedIterable = this.prevBuilder(this.sourceIterable);

    async function* emitChunks(): AsyncGenerator<InferUIMessageChunk<UI_MESSAGE>> {
      for await (const item of processedIterable) {
        yield item.chunk;
      }
    }

    const outputStream = convertAsyncIteratorToReadableStream(emitChunks());

    return createAsyncIterableStream(outputStream);
  }

  [Symbol.asyncIterator](): AsyncIterator<InferUIMessageChunk<UI_MESSAGE>> {
    return this.toStream()[Symbol.asyncIterator]();
  }
}
