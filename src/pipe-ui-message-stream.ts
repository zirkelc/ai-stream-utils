import type { AsyncIterableStream, InferUIMessageChunk, UIMessage } from 'ai';
import {
  type FilterUIMessageStreamPredicate,
  filterUIMessageStream,
} from './filter-ui-message-stream.js';
import {
  type MapUIMessageStreamFn,
  mapUIMessageStream,
} from './map-ui-message-stream.js';
import type { InferUIMessagePart, InferUIMessagePartType } from './types.js';
import { createAsyncIterableStream } from './utils/create-async-iterable-stream.js';

/* ============================================================================
 * Type Utilities
 * ============================================================================ */

/**
 * Extract a specific part type from UIMessage
 */
type ExtractPart<
  UI_MESSAGE extends UIMessage,
  PART_TYPE extends InferUIMessagePartType<UI_MESSAGE>,
> = Extract<InferUIMessagePart<UI_MESSAGE>, { type: PART_TYPE }>;

/**
 * Type guard predicate for matching part types
 */
export type PartTypePredicate<
  UI_MESSAGE extends UIMessage,
  PART_TYPE extends InferUIMessagePartType<UI_MESSAGE>,
> = (
  part: InferUIMessagePart<UI_MESSAGE>,
) => part is ExtractPart<UI_MESSAGE, PART_TYPE>;

/* ============================================================================
 * Match Pipeline Types
 * ============================================================================ */

/**
 * Input for match pipeline operations (typed to specific part)
 */
export type MatchPipelineInput<
  UI_MESSAGE extends UIMessage,
  PART_TYPE extends InferUIMessagePartType<UI_MESSAGE>,
> = {
  chunk: InferUIMessageChunk<UI_MESSAGE>;
  part: ExtractPart<UI_MESSAGE, PART_TYPE>;
};

/**
 * Map function for match pipeline
 */
export type MatchPipelineMapFn<
  UI_MESSAGE extends UIMessage,
  PART_TYPE extends InferUIMessagePartType<UI_MESSAGE>,
> = (
  input: MatchPipelineInput<UI_MESSAGE, PART_TYPE>,
) =>
  | InferUIMessageChunk<UI_MESSAGE>
  | Array<InferUIMessageChunk<UI_MESSAGE>>
  | null;

/**
 * Filter predicate for match pipeline
 */
export type MatchPipelineFilterPredicate<
  UI_MESSAGE extends UIMessage,
  PART_TYPE extends InferUIMessagePartType<UI_MESSAGE>,
> = (input: MatchPipelineInput<UI_MESSAGE, PART_TYPE>) => boolean;

/* ============================================================================
 * Match Pipeline Class
 * ============================================================================ */

/**
 * Pipeline for working with chunks of a specific part type.
 * Operations only apply to chunks matching the predicate set by the parent pipeline.
 */
export class MatchPipeline<
  UI_MESSAGE extends UIMessage,
  PART_TYPE extends InferUIMessagePartType<UI_MESSAGE>,
> {
  private streamBuilder: (
    stream: ReadableStream<InferUIMessageChunk<UI_MESSAGE>>,
  ) => AsyncIterableStream<InferUIMessageChunk<UI_MESSAGE>>;

  private predicate!: PartTypePredicate<UI_MESSAGE, PART_TYPE>;

  constructor() {
    this.streamBuilder = (s) => createAsyncIterableStream(s);
  }

  /**
   * Sets the predicate for this match pipeline.
   * Called by the parent pipeline.
   */
  setPredicate(predicate: PartTypePredicate<UI_MESSAGE, PART_TYPE>): void {
    this.predicate = predicate;
  }

  /**
   * Adds a filter operation to the match pipeline.
   * Only applies to chunks where the match predicate is true.
   *
   * @example
   * ```typescript
   * .match(partTypeIs('text'), (pipe) =>
   *   pipe.filter(({ chunk }) => chunk.type !== 'text-start')
   * )
   * ```
   */
  filter(
    userPredicate: MatchPipelineFilterPredicate<UI_MESSAGE, PART_TYPE>,
  ): MatchPipeline<UI_MESSAGE, PART_TYPE> {
    const prev = this.streamBuilder;
    const matchPredicate = this.predicate;

    this.streamBuilder = (stream) =>
      filterUIMessageStream(prev(stream), (input) => {
        if (!matchPredicate(input.part)) {
          /* Non-matching: pass through unchanged */
          return true;
        }
        /* Matching: apply user's filter */
        return userPredicate(
          input as MatchPipelineInput<UI_MESSAGE, PART_TYPE>,
        );
      });

    return this;
  }

  /**
   * Adds a map operation to the match pipeline.
   * Only applies to chunks where the match predicate is true.
   *
   * @example
   * ```typescript
   * .match(partTypeIs('text'), (pipe) =>
   *   pipe.map(({ chunk }) => {
   *     if (chunk.type === 'text-delta') {
   *       return { ...chunk, delta: chunk.delta.toUpperCase() };
   *     }
   *     return chunk;
   *   })
   * )
   * ```
   */
  map(
    userMapFn: MatchPipelineMapFn<UI_MESSAGE, PART_TYPE>,
  ): MatchPipeline<UI_MESSAGE, PART_TYPE> {
    const prev = this.streamBuilder;
    const matchPredicate = this.predicate;

    this.streamBuilder = (stream) =>
      mapUIMessageStream(prev(stream), (input) => {
        if (!matchPredicate(input.part)) {
          /* Non-matching: pass through unchanged */
          return input.chunk;
        }
        /* Matching: apply user's map */
        return userMapFn(input as MatchPipelineInput<UI_MESSAGE, PART_TYPE>);
      });

    return this;
  }

  /**
   * Builds the stream with all operations applied.
   */
  toStream(
    inputStream: ReadableStream<InferUIMessageChunk<UI_MESSAGE>>,
  ): AsyncIterableStream<InferUIMessageChunk<UI_MESSAGE>> {
    return this.streamBuilder(inputStream);
  }
}

/* ============================================================================
 * Main Pipeline Class
 * ============================================================================ */

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
  private streamBuilder: (
    stream: ReadableStream<InferUIMessageChunk<UI_MESSAGE>>,
  ) => AsyncIterableStream<InferUIMessageChunk<UI_MESSAGE>>;

  private consumed = false;

  constructor(
    private inputStream: ReadableStream<InferUIMessageChunk<UI_MESSAGE>>,
  ) {
    this.streamBuilder = (s) => createAsyncIterableStream(s);
  }

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
    const prev = this.streamBuilder;
    this.streamBuilder = (stream) =>
      filterUIMessageStream(prev(stream), predicate);
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
    const prev = this.streamBuilder;
    this.streamBuilder = (stream) => mapUIMessageStream(prev(stream), mapFn);
    return this;
  }

  /**
   * Matches specific part types and processes them in a sub-pipeline.
   * Non-matching chunks pass through unchanged.
   *
   * @example
   * ```typescript
   * pipeUIMessageStream(stream)
   *   .match(partTypeIs('text'), (pipe) =>
   *     pipe
   *       .filter(({ chunk }) => chunk.type !== 'text-start')
   *       .map(({ chunk }) => {
   *         if (chunk.type === 'text-delta') {
   *           return { ...chunk, delta: chunk.delta.toUpperCase() };
   *         }
   *         return chunk;
   *       })
   *   )
   *   .toStream();
   * ```
   */
  match<PART_TYPE extends InferUIMessagePartType<UI_MESSAGE>>(
    predicate: PartTypePredicate<UI_MESSAGE, PART_TYPE>,
    handler: (
      pipe: MatchPipeline<UI_MESSAGE, PART_TYPE>,
    ) => MatchPipeline<UI_MESSAGE, PART_TYPE>,
  ): UIMessageStreamPipeline<UI_MESSAGE> {
    const matchPipeline = new MatchPipeline<UI_MESSAGE, PART_TYPE>();
    matchPipeline.setPredicate(predicate);
    handler(matchPipeline);

    const prev = this.streamBuilder;
    this.streamBuilder = (stream) => matchPipeline.toStream(prev(stream));

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

    return this.streamBuilder(this.inputStream);
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

/* ============================================================================
 * Entry Point
 * ============================================================================ */

/**
 * Creates a fluent pipeline for composing UIMessageStream operations.
 *
 * The pipeline allows chaining multiple filter, map, and match operations
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
 *
 * // Match and transform specific part types
 * const stream = pipeUIMessageStream<MyUIMessage>(inputStream)
 *   .match(partTypeIs('text'), (pipe) =>
 *     pipe.map(({ chunk }) => {
 *       if (chunk.type === 'text-delta') {
 *         return { ...chunk, delta: chunk.delta.toUpperCase() };
 *       }
 *       return chunk;
 *     })
 *   )
 *   .toStream();
 * ```
 */
export function pipeUIMessageStream<UI_MESSAGE extends UIMessage>(
  stream: ReadableStream<InferUIMessageChunk<UI_MESSAGE>>,
): UIMessageStreamPipeline<UI_MESSAGE> {
  return new UIMessageStreamPipeline(stream);
}

/* ============================================================================
 * Helper: matchPartType (type guard version)
 * ============================================================================ */

/**
 * Creates a type guard predicate for matching part types.
 * Use with `.match()` to process specific part types.
 *
 * @example
 * ```typescript
 * pipeUIMessageStream<MyUIMessage>(stream)
 *   .match(matchPartType('text'), (pipe) =>
 *     pipe.map(({ chunk, part }) => {
 *       // part is typed as TextPart
 *       console.log(part.text);
 *       return chunk;
 *     })
 *   )
 *   .toStream();
 *
 * // Match multiple part types
 * .match(matchPartType(['text', 'reasoning']), (pipe) => ...)
 * ```
 */
export function matchPartType<
  UI_MESSAGE extends UIMessage,
  PART_TYPE extends InferUIMessagePartType<UI_MESSAGE>,
>(
  type: PART_TYPE | Array<PART_TYPE>,
): PartTypePredicate<UI_MESSAGE, PART_TYPE> {
  const types = Array.isArray(type) ? type : [type];
  return (part): part is ExtractPart<UI_MESSAGE, PART_TYPE> =>
    types.includes(part.type as PART_TYPE);
}
