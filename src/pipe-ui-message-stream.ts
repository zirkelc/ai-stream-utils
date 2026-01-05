import type { AsyncIterableStream, InferUIMessageChunk, UIMessage } from 'ai';
import {
  type FilterUIMessageStreamPredicate,
  filterUIMessageStream,
} from './filter-ui-message-stream.js';
import {
  type FlatMapUIMessageStreamFn,
  type FlatMapUIMessageStreamPredicate,
  flatMapUIMessageStream,
} from './flat-map-ui-message-stream.js';
import {
  type MapUIMessageStreamFn,
  mapUIMessageStream,
} from './map-ui-message-stream.js';
import type { InferUIMessagePart } from './types.js';
import { createAsyncIterableStream } from './utils/create-async-iterable-stream.js';

type StreamOperation<UI_MESSAGE extends UIMessage> = (
  stream: ReadableStream<InferUIMessageChunk<UI_MESSAGE>>,
) => AsyncIterableStream<InferUIMessageChunk<UI_MESSAGE>>;

/**
 * Fluent pipeline builder for composing UIMessageStream operations.
 *
 * IMPORTANT: The pipeline can only be consumed once. Calling `toStream()` or
 * iterating over the pipeline multiple times will throw an error because the
 * underlying stream can only be read once.
 */
export class UIMessageStreamPipeline<UI_MESSAGE extends UIMessage>
  implements AsyncIterable<InferUIMessageChunk<UI_MESSAGE>>
{
  private operations: Array<StreamOperation<UI_MESSAGE>> = [];
  private consumed = false;

  constructor(
    private inputStream: ReadableStream<InferUIMessageChunk<UI_MESSAGE>>,
  ) {}

  /**
   * Throws an error if the pipeline has already been consumed.
   */
  private assertNotConsumed(): void {
    if (this.consumed) {
      throw new Error(
        `Pipeline has already been consumed. The underlying stream can only be read once.`,
      );
    }
  }

  /**
   * Adds a filter operation to the pipeline.
   *
   * @example
   * ```typescript
   * pipeUIMessageStream(stream)
   *   .filter(includeParts(['text']))
   *   .toStream();
   * ```
   */
  filter(
    predicate: FilterUIMessageStreamPredicate<UI_MESSAGE>,
  ): UIMessageStreamPipeline<UI_MESSAGE> {
    this.operations.push((stream) => filterUIMessageStream(stream, predicate));
    return this;
  }

  /**
   * Adds a map operation to the pipeline.
   *
   * @example
   * ```typescript
   * pipeUIMessageStream(stream)
   *   .map(({ chunk }) => {
   *     if (chunk.type === 'text-delta') {
   *       return { ...chunk, delta: chunk.delta.toUpperCase() };
   *     }
   *     return chunk;
   *   })
   *   .toStream();
   * ```
   */
  map(
    mapFn: MapUIMessageStreamFn<UI_MESSAGE>,
  ): UIMessageStreamPipeline<UI_MESSAGE> {
    this.operations.push((stream) => mapUIMessageStream(stream, mapFn));
    return this;
  }

  /**
   * Adds a flatMap operation to the pipeline.
   *
   * @example
   * ```typescript
   * // Buffer and transform specific parts
   * pipeUIMessageStream(stream)
   *   .flatMap(partTypeIs('text'), ({ part }) => ({
   *     ...part,
   *     text: part.text.toUpperCase(),
   *   }))
   *   .toStream();
   *
   * // Transform all parts
   * pipeUIMessageStream(stream)
   *   .flatMap(({ part }) => {
   *     if (part.type === 'reasoning') return null;
   *     return part;
   *   })
   *   .toStream();
   * ```
   */
  flatMap<PART extends InferUIMessagePart<UI_MESSAGE>>(
    predicate: FlatMapUIMessageStreamPredicate<UI_MESSAGE, PART>,
    flatMapFn: FlatMapUIMessageStreamFn<UI_MESSAGE, PART>,
  ): UIMessageStreamPipeline<UI_MESSAGE>;
  flatMap(
    flatMapFn: FlatMapUIMessageStreamFn<UI_MESSAGE>,
  ): UIMessageStreamPipeline<UI_MESSAGE>;
  flatMap<PART extends InferUIMessagePart<UI_MESSAGE>>(
    predicateOrFn:
      | FlatMapUIMessageStreamPredicate<UI_MESSAGE, PART>
      | FlatMapUIMessageStreamFn<UI_MESSAGE>,
    flatMapFn?: FlatMapUIMessageStreamFn<UI_MESSAGE, PART>,
  ): UIMessageStreamPipeline<UI_MESSAGE> {
    if (flatMapFn) {
      const predicate = predicateOrFn as FlatMapUIMessageStreamPredicate<
        UI_MESSAGE,
        PART
      >;
      this.operations.push((stream) =>
        flatMapUIMessageStream(stream, predicate, flatMapFn),
      );
    } else {
      const fn = predicateOrFn as FlatMapUIMessageStreamFn<UI_MESSAGE>;
      this.operations.push((stream) => flatMapUIMessageStream(stream, fn));
    }
    return this;
  }

  /**
   * Execute the pipeline and return the resulting stream.
   *
   * IMPORTANT: This method can only be called once. The underlying stream
   * can only be read once, so subsequent calls will throw an error.
   *
   * @example
   * ```typescript
   * const resultStream = pipeUIMessageStream(stream)
   *   .filter(includeParts(['text']))
   *   .map(({ chunk }) => chunk)
   *   .toStream();
   * ```
   */
  toStream(): AsyncIterableStream<InferUIMessageChunk<UI_MESSAGE>> {
    this.assertNotConsumed();
    this.consumed = true;

    if (this.operations.length === 0) {
      return createAsyncIterableStream(this.inputStream);
    }

    return this.operations.reduce(
      (stream, operation) => operation(stream),
      this.inputStream as AsyncIterableStream<InferUIMessageChunk<UI_MESSAGE>>,
    );
  }

  /**
   * Implements AsyncIterable so the pipeline can be used directly with for-await-of.
   *
   * IMPORTANT: The pipeline can only be iterated once. The underlying stream
   * can only be read once, so subsequent iterations will throw an error.
   *
   * @example
   * ```typescript
   * for await (const chunk of pipeUIMessageStream(stream).filter(...)) {
   *   console.log(chunk);
   * }
   * ```
   */
  [Symbol.asyncIterator](): AsyncIterator<InferUIMessageChunk<UI_MESSAGE>> {
    return this.toStream()[Symbol.asyncIterator]();
  }
}

/**
 * Creates a fluent pipeline for composing UIMessageStream operations.
 *
 * The pipeline allows chaining multiple filter, map, and flatMap operations
 * in a readable, fluent style. Operations are applied in order when
 * `toStream()` is called or when the pipeline is iterated.
 *
 * IMPORTANT: The pipeline can only be consumed once (via `toStream()` or
 * iteration) because the underlying stream can only be read once.
 *
 * @example
 * ```typescript
 * // Chain multiple operations
 * const stream = pipeUIMessageStream<MyUIMessage>(inputStream)
 *   .filter(includeParts(['text', 'reasoning']))
 *   .map(({ chunk }) => {
 *     if (chunk.type === 'text-delta') {
 *       return { ...chunk, delta: chunk.delta.toUpperCase() };
 *     }
 *     return chunk;
 *   })
 *   .filter(excludeParts(['reasoning']))
 *   .toStream();
 *
 * // Use directly as AsyncIterable
 * for await (const chunk of pipeUIMessageStream(stream).filter(...).map(...)) {
 *   console.log(chunk);
 * }
 * ```
 */
export function pipeUIMessageStream<UI_MESSAGE extends UIMessage>(
  stream: ReadableStream<InferUIMessageChunk<UI_MESSAGE>>,
): UIMessageStreamPipeline<UI_MESSAGE> {
  return new UIMessageStreamPipeline(stream);
}
