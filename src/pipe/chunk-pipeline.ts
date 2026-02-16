import { convertAsyncIterableToStream } from "../utils/convert-async-iterable-to-stream.js";
import type { AsyncIterableStream, InferUIMessageChunk, UIMessage } from "ai";
import { asArray } from "../internal/utils.js";
import type { ContentChunkType, ExtractChunk } from "../types.js";
import { createAsyncIterableStream } from "../utils/create-async-iterable-stream.js";
import type { BasePipeline, InternalChunk } from "./base-pipeline.js";
import type {
  ChunkBuilder,
  ChunkFilterFn,
  ChunkInput,
  ChunkMapFn,
  ChunkObserveFn,
  ChunkObserveInput,
  FilterGuard,
  ObserveGuard,
} from "./types.js";

/**
 * Pipeline for chunk-based operations.
 * Operations receive individual chunks with their associated part type.
 */
export class ChunkPipeline<
  UI_MESSAGE extends UIMessage,
  CHUNK extends InferUIMessageChunk<UI_MESSAGE>,
  PART extends { type: string },
>
  implements BasePipeline<UI_MESSAGE>, AsyncIterable<InferUIMessageChunk<UI_MESSAGE>>
{
  private consumed = false;
  private sourceIterable: AsyncIterable<InternalChunk<UI_MESSAGE>>;
  private prevBuilder: ChunkBuilder<UI_MESSAGE>;

  constructor(
    sourceIterable: AsyncIterable<InternalChunk<UI_MESSAGE>>,
    prevBuilder: ChunkBuilder<UI_MESSAGE> = (s) => s,
  ) {
    this.sourceIterable = sourceIterable;
    this.prevBuilder = prevBuilder;
  }

  private assertNotConsumed(): void {
    if (this.consumed) {
      throw new Error(`Pipeline has already been consumed.`);
    }
  }

  /**
   * Filters chunks using a type guard and narrows both chunk and part types.
   * Use with includeChunks(), includeParts(), excludeChunks(), or excludeParts().
   * The callback only receives content chunks because meta chunks pass through unchanged.
   */
  filter<
    NARROWED_CHUNK extends InferUIMessageChunk<UI_MESSAGE>,
    NARROWED_PART extends { type: string },
  >(
    guard: FilterGuard<UI_MESSAGE, NARROWED_CHUNK, NARROWED_PART>,
  ): ChunkPipeline<UI_MESSAGE, NARROWED_CHUNK, NARROWED_PART>;

  /**
   * Filters chunks using a generic predicate function.
   * The callback only receives content chunks because meta chunks pass through unchanged.
   */
  filter(
    predicate: ChunkFilterFn<CHUNK & ExtractChunk<UI_MESSAGE, ContentChunkType<UI_MESSAGE>>, PART>,
  ): ChunkPipeline<UI_MESSAGE, CHUNK, PART>;

  filter(
    predicate: ChunkFilterFn<any, any> | FilterGuard<UI_MESSAGE, any, any>,
  ): ChunkPipeline<UI_MESSAGE, any, any> {
    /**
     * The predicate is cast to a simple function type for runtime execution.
     */
    const predicateFn = predicate as ChunkFilterFn<CHUNK, PART>;

    const nextBuilder: ChunkBuilder<UI_MESSAGE> = (iterable) => {
      const prevIterable = this.prevBuilder(iterable);

      async function* generator(): AsyncGenerator<InternalChunk<UI_MESSAGE>> {
        for await (const item of prevIterable) {
          /**
           * Meta chunks always pass through without filtering.
           */
          if (item.partType === undefined) {
            yield item;
            continue;
          }

          /**
           * Apply the predicate to determine if the chunk should be included.
           */
          const input = {
            chunk: item.chunk,
            part: { type: item.partType },
          } as ChunkInput<CHUNK, PART>;

          if (predicateFn(input)) {
            yield item;
          }
        }
      }

      return generator();
    };

    return new ChunkPipeline(this.sourceIterable, nextBuilder);
  }

  /**
   * Transforms chunks by applying a mapping function.
   * The callback only receives content chunks because meta chunks pass through unchanged.
   * Returning null filters out the chunk, while returning an array yields multiple chunks.
   */
  map(
    fn: ChunkMapFn<
      UI_MESSAGE,
      CHUNK & ExtractChunk<UI_MESSAGE, ContentChunkType<UI_MESSAGE>>,
      PART
    >,
  ): ChunkPipeline<UI_MESSAGE, CHUNK, PART> {
    const nextBuilder: ChunkBuilder<UI_MESSAGE> = (iterable) => {
      const prevIterable = this.prevBuilder(iterable);

      async function* generator(): AsyncGenerator<InternalChunk<UI_MESSAGE>> {
        for await (const item of prevIterable) {
          /**
           * Meta chunks always pass through unchanged without transformation.
           */
          if (item.partType === undefined) {
            yield item;
            continue;
          }

          /**
           * Apply the transform function.
           * The cast is safe because meta chunks have been excluded above.
           */
          const input = {
            chunk: item.chunk,
            part: { type: item.partType },
          } as ChunkInput<CHUNK & ExtractChunk<UI_MESSAGE, ContentChunkType<UI_MESSAGE>>, PART>;

          const result = fn(input);
          /**
           * The asArray utility normalizes the result: null becomes an empty array,
           * a single chunk becomes an array with one element, and arrays pass through as-is.
           * An empty array means the chunk is filtered out and not yielded.
           */
          const chunks = asArray(result);

          for (const chunk of chunks) {
            yield { chunk, partType: item.partType };
          }
        }
      }

      return generator();
    };

    return new ChunkPipeline<UI_MESSAGE, CHUNK, PART>(this.sourceIterable, nextBuilder);
  }

  /**
   * Observes chunks matching a type guard without filtering them.
   * The callback receives a narrowed chunk type and inferred part type.
   * Content chunks include a part object with the type, while meta chunks have undefined part.
   * All chunks pass through regardless of whether the callback is invoked.
   */
  on<
    NARROWED_CHUNK extends InferUIMessageChunk<UI_MESSAGE>,
    NARROWED_PART extends { type: string } | undefined,
  >(
    guard: ObserveGuard<UI_MESSAGE, NARROWED_CHUNK, NARROWED_PART>,
    callback: ChunkObserveFn<NARROWED_CHUNK, NARROWED_PART>,
  ): ChunkPipeline<UI_MESSAGE, CHUNK, PART>;

  /**
   * Observes chunks matching a predicate without filtering them.
   * Uses the current pipeline types without type narrowing.
   * All chunks pass through regardless of whether the callback is invoked.
   */
  on(
    predicate: (input: ChunkObserveInput<CHUNK>) => boolean,
    callback: ChunkObserveFn<CHUNK, { type: PART[`type`] } | undefined>,
  ): ChunkPipeline<UI_MESSAGE, CHUNK, PART>;

  on(
    predicate: ((input: ChunkObserveInput<CHUNK>) => boolean) | ObserveGuard<UI_MESSAGE, any, any>,
    callback: ChunkObserveFn<any, any>,
  ): ChunkPipeline<UI_MESSAGE, CHUNK, PART> {
    /**
     * The predicate is cast to a simple function type for runtime execution.
     */
    const predicateFn = predicate as (input: ChunkObserveInput<CHUNK>) => boolean;

    const nextBuilder: ChunkBuilder<UI_MESSAGE> = (iterable) => {
      const prevIterable = this.prevBuilder(iterable);

      async function* generator(): AsyncGenerator<InternalChunk<UI_MESSAGE>> {
        for await (const item of prevIterable) {
          /**
           * Build the input object for the predicate and callback.
           * Content chunks get a part object with the type, while meta chunks get undefined.
           */
          const input = {
            chunk: item.chunk,
            part: item.partType !== undefined ? { type: item.partType } : undefined,
          } as ChunkObserveInput<CHUNK>;

          if (predicateFn(input)) {
            await callback(input);
          }

          yield item;
        }
      }

      return generator();
    };

    return new ChunkPipeline<UI_MESSAGE, CHUNK, PART>(this.sourceIterable, nextBuilder);
  }

  /**
   * Executes the pipeline and returns the resulting stream.
   * All chunks pass through including step boundaries and meta chunks.
   */
  toStream(): AsyncIterableStream<InferUIMessageChunk<UI_MESSAGE>> {
    this.assertNotConsumed();
    this.consumed = true;

    const processedIterable = this.prevBuilder(this.sourceIterable);

    /**
     * Unwrap internal chunks by extracting just the chunk property.
     * This removes the internal partType metadata used for pipeline operations.
     */
    async function* generator(): AsyncGenerator<InferUIMessageChunk<UI_MESSAGE>> {
      for await (const item of processedIterable) {
        yield item.chunk;
      }
    }

    const outputStream = convertAsyncIterableToStream(generator());

    return createAsyncIterableStream(outputStream);
  }

  [Symbol.asyncIterator](): AsyncIterator<InferUIMessageChunk<UI_MESSAGE>> {
    return this.toStream()[Symbol.asyncIterator]();
  }
}
