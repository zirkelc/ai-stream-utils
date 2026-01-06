import type { AsyncIterableStream, InferUIMessageChunk, UIMessage } from 'ai';
import {
  type FilterPredicate,
  filterUIMessageStream,
} from './filter-ui-message-stream.js';
import {
  type MapUIMessageStreamFn,
  mapUIMessageStream,
} from './map-ui-message-stream.js';
import type {
  ExcludePart,
  ExtractChunkForPart,
  ExtractPart,
  InferUIMessagePart,
  InferUIMessagePartType,
} from './types.js';
import { createAsyncIterableStream } from './utils/create-async-iterable-stream.js';

/* ============================================================================
 * Type Utilities
 * ============================================================================ */

/**
 * Type guard predicate for matching part types.
 * The predicate narrows to the actual part type (e.g., TextUIPart), not the type literal (e.g., 'text').
 */
export type PartTypePredicate<
  UI_MESSAGE extends UIMessage,
  PART extends InferUIMessagePart<UI_MESSAGE>,
> = (part: InferUIMessagePart<UI_MESSAGE>) => part is PART;

/* ============================================================================
 * Match Pipeline Types
 * ============================================================================ */

/**
 * Input for match pipeline operations (typed to specific part and chunk)
 */
export type MatchPipelineInput<
  UI_MESSAGE extends UIMessage,
  PART extends InferUIMessagePart<UI_MESSAGE>,
> = {
  chunk: ExtractChunkForPart<UI_MESSAGE, PART>;
  part: PART;
};

/**
 * Map function for match pipeline
 */
export type MatchPipelineMapFn<
  UI_MESSAGE extends UIMessage,
  PART extends InferUIMessagePart<UI_MESSAGE>,
> = (
  input: MatchPipelineInput<UI_MESSAGE, PART>,
) =>
  | InferUIMessageChunk<UI_MESSAGE>
  | Array<InferUIMessageChunk<UI_MESSAGE>>
  | null;

/**
 * Filter predicate for match pipeline
 */
export type MatchPipelineFilterPredicate<
  UI_MESSAGE extends UIMessage,
  PART extends InferUIMessagePart<UI_MESSAGE>,
> = (input: MatchPipelineInput<UI_MESSAGE, PART>) => boolean;

/* ============================================================================
 * Match Pipeline Class
 * ============================================================================ */

/**
 * Pipeline for working with chunks of a specific part type.
 * Operations only apply to chunks matching the predicate set by the parent pipeline.
 *
 * Each operation returns a new MatchPipeline instance with the appropriate
 * type parameters (immutable pattern for type narrowing support).
 */
export class MatchPipeline<
  UI_MESSAGE extends UIMessage,
  PART extends InferUIMessagePart<UI_MESSAGE>,
> {
  constructor(
    private readonly matchPredicate: PartTypePredicate<UI_MESSAGE, PART>,
    private readonly streamBuilder: (
      stream: ReadableStream<InferUIMessageChunk<UI_MESSAGE>>,
    ) => AsyncIterableStream<InferUIMessageChunk<UI_MESSAGE>> = (s) =>
      createAsyncIterableStream(s),
  ) {}

  /**
   * Adds a filter operation to the match pipeline.
   * Only applies to chunks where the match predicate is true.
   *
   * When using typed predicates from `includeParts()` or `excludeParts()`,
   * the part type is automatically narrowed in subsequent operations.
   *
   * @example
   * ```typescript
   * .match(isPartType('text'), (pipe) =>
   *   pipe.filter(({ chunk }) => chunk.type !== 'text-start')
   * )
   *
   * // With type narrowing
   * .match(isPartType(['text', 'reasoning']), (pipe) =>
   *   pipe
   *     .filter(includeParts(['text']))
   *     .map(({ part }) => {
   *       // part is narrowed to TextPart
   *       return chunk;
   *     })
   * )
   * ```
   */
  filter<PREDICATE_PART extends InferUIMessagePart<UI_MESSAGE> = PART>(
    userPredicate: FilterPredicate<UI_MESSAGE, PREDICATE_PART>,
  ): MatchPipeline<UI_MESSAGE, PART & PREDICATE_PART> {
    const prev = this.streamBuilder;
    const matchPredicate = this.matchPredicate;

    const newStreamBuilder = (
      stream: ReadableStream<InferUIMessageChunk<UI_MESSAGE>>,
    ) =>
      filterUIMessageStream(prev(stream), (input) => {
        if (!matchPredicate(input.part)) {
          /* Non-matching: pass through unchanged */
          return true;
        }
        /* Matching: apply user's filter */
        return userPredicate(input);
      });

    return new MatchPipeline<UI_MESSAGE, PART & PREDICATE_PART>(
      matchPredicate as PartTypePredicate<UI_MESSAGE, PART & PREDICATE_PART>,
      newStreamBuilder,
    );
  }

  /**
   * Adds a map operation to the match pipeline.
   * Only applies to chunks where the match predicate is true.
   *
   * @example
   * ```typescript
   * .match(isPartType('text'), (pipe) =>
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
    userMapFn: MatchPipelineMapFn<UI_MESSAGE, PART>,
  ): MatchPipeline<UI_MESSAGE, PART> {
    const prev = this.streamBuilder;
    const matchPredicate = this.matchPredicate;

    const newStreamBuilder = (
      stream: ReadableStream<InferUIMessageChunk<UI_MESSAGE>>,
    ) =>
      mapUIMessageStream(prev(stream), (input) => {
        if (!matchPredicate(input.part)) {
          /* Non-matching: pass through unchanged */
          return input.chunk;
        }
        /* Matching: apply user's map */
        return userMapFn(input as MatchPipelineInput<UI_MESSAGE, PART>);
      });

    return new MatchPipeline<UI_MESSAGE, PART>(
      matchPredicate,
      newStreamBuilder,
    );
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
 * Pipeline Input Types
 * ============================================================================ */

/**
 * Input for pipeline map operations with narrowed part and chunk types.
 */
export type PipelineMapInput<
  UI_MESSAGE extends UIMessage,
  PART extends InferUIMessagePart<UI_MESSAGE>,
> = {
  chunk: ExtractChunkForPart<UI_MESSAGE, PART>;
  part: PART;
};

/**
 * Map function for pipeline with narrowed part type.
 */
export type PipelineMapFn<
  UI_MESSAGE extends UIMessage,
  PART extends InferUIMessagePart<UI_MESSAGE>,
> = (
  input: PipelineMapInput<UI_MESSAGE, PART>,
) =>
  | InferUIMessageChunk<UI_MESSAGE>
  | Array<InferUIMessageChunk<UI_MESSAGE>>
  | null;

/* ============================================================================
 * Main Pipeline Class
 * ============================================================================ */

/**
 * Fluent pipeline builder for composing UIMessageStream operations.
 *
 * The pipeline tracks the narrowed part type through the chain via the `PART`
 * type parameter. Each operation returns a new pipeline instance with the
 * appropriate part type.
 *
 * IMPORTANT: The pipeline can only be consumed once. Calling `toStream()` or
 * iterating over the pipeline multiple times will throw an error because the
 * underlying stream can only be read once.
 */
export class UIMessageStreamPipeline<
  UI_MESSAGE extends UIMessage,
  PART extends InferUIMessagePart<UI_MESSAGE> = InferUIMessagePart<UI_MESSAGE>,
> implements AsyncIterable<InferUIMessageChunk<UI_MESSAGE>>
{
  private consumed = false;

  constructor(
    private inputStream: ReadableStream<InferUIMessageChunk<UI_MESSAGE>>,
    private streamBuilder: (
      stream: ReadableStream<InferUIMessageChunk<UI_MESSAGE>>,
    ) => AsyncIterableStream<InferUIMessageChunk<UI_MESSAGE>> = (s) =>
      createAsyncIterableStream(s),
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
   * When using typed predicates from `includeParts()` or `excludeParts()`,
   * the part type is automatically narrowed in subsequent operations.
   * The resulting type is the intersection of the current part type and
   * the predicate's narrowed type.
   *
   * When using a plain predicate function, the current part type is preserved
   * (since plain predicates default to all parts, the intersection is unchanged).
   *
   * @example
   * ```typescript
   * // Typed predicate narrows the type
   * pipeUIMessageStream<MyUIMessage>(stream)
   *   .filter(includeParts(['text', 'reasoning']))
   *   .map(({ chunk, part }) => {
   *     // part is typed as TextPart | ReasoningPart
   *     return chunk;
   *   })
   *   .toStream();
   *
   * // Chaining includeParts then excludeParts computes intersection
   * pipeUIMessageStream<MyUIMessage>(stream)
   *   .filter(includeParts(['text', 'reasoning']))
   *   .filter(excludeParts(['reasoning']))
   *   .map(({ chunk, part }) => {
   *     // part is typed as TextPart (intersection of the two filters)
   *     return chunk;
   *   })
   *   .toStream();
   *
   * // Plain predicate preserves current type
   * pipeUIMessageStream<MyUIMessage>(stream)
   *   .filter(includeParts(['text']))
   *   .filter(({ chunk }) => chunk.type !== 'text-start')
   *   .map(({ chunk, part }) => {
   *     // part is still typed as TextPart
   *     return chunk;
   *   })
   *   .toStream();
   * ```
   */
  filter<PREDICATE_PART extends InferUIMessagePart<UI_MESSAGE> = PART>(
    predicate: FilterPredicate<UI_MESSAGE, PREDICATE_PART>,
  ): UIMessageStreamPipeline<UI_MESSAGE, PART & PREDICATE_PART> {
    const prev = this.streamBuilder;
    const newStreamBuilder = (
      stream: ReadableStream<InferUIMessageChunk<UI_MESSAGE>>,
    ) =>
      filterUIMessageStream(
        prev(stream),
        predicate as FilterPredicate<UI_MESSAGE>,
      );

    return new UIMessageStreamPipeline<UI_MESSAGE, PART & PREDICATE_PART>(
      this.inputStream,
      newStreamBuilder,
    );
  }

  /**
   * Adds a map operation to the pipeline.
   * The map function receives the narrowed part type.
   *
   * @example
   * ```typescript
   * pipeUIMessageStream<MyUIMessage>(stream)
   *   .filter(includeParts(['text']))
   *   .map(({ chunk, part }) => {
   *     // part is typed as TextPart
   *     if (chunk.type === 'text-delta') {
   *       return { ...chunk, delta: chunk.delta.toUpperCase() };
   *     }
   *     return chunk;
   *   })
   *   .toStream();
   * ```
   */
  map(
    mapFn: PipelineMapFn<UI_MESSAGE, PART>,
  ): UIMessageStreamPipeline<UI_MESSAGE, PART> {
    const prev = this.streamBuilder;
    const newStreamBuilder = (
      stream: ReadableStream<InferUIMessageChunk<UI_MESSAGE>>,
    ) =>
      mapUIMessageStream(
        prev(stream),
        mapFn as MapUIMessageStreamFn<UI_MESSAGE>,
      );

    return new UIMessageStreamPipeline<UI_MESSAGE, PART>(
      this.inputStream,
      newStreamBuilder,
    );
  }

  /**
   * Matches specific part types and processes them in a sub-pipeline.
   * Non-matching chunks pass through unchanged.
   *
   * @example
   * ```typescript
   * pipeUIMessageStream(stream)
   *   .match(isPartType('text'), (pipe) =>
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
  match<MATCHED_PART extends PART>(
    predicate: PartTypePredicate<UI_MESSAGE, MATCHED_PART>,
    handler: (
      pipe: MatchPipeline<UI_MESSAGE, MATCHED_PART>,
    ) => MatchPipeline<UI_MESSAGE, InferUIMessagePart<UI_MESSAGE>>,
  ): UIMessageStreamPipeline<UI_MESSAGE, PART> {
    const matchPipeline = new MatchPipeline<UI_MESSAGE, MATCHED_PART>(
      predicate,
    );
    const resultPipeline = handler(matchPipeline);

    const prev = this.streamBuilder;
    const newStreamBuilder = (
      stream: ReadableStream<InferUIMessageChunk<UI_MESSAGE>>,
    ) => resultPipeline.toStream(prev(stream));

    return new UIMessageStreamPipeline<UI_MESSAGE, PART>(
      this.inputStream,
      newStreamBuilder,
    );
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
 * When using typed predicates like `includeParts()` or `excludeParts()`,
 * the part type is automatically narrowed in subsequent operations.
 *
 * IMPORTANT: The pipeline can only be consumed once (via `toStream()` or
 * iteration) because the underlying stream can only be read once.
 *
 * @example
 * ```typescript
 * // Chain multiple operations with type narrowing
 * const stream = pipeUIMessageStream<MyUIMessage>(inputStream)
 *   .filter(includeParts(['text', 'reasoning']))
 *   .map(({ chunk, part }) => {
 *     // part is typed as TextPart | ReasoningPart
 *     if (chunk.type === 'text-delta') {
 *       return { ...chunk, delta: chunk.delta.toUpperCase() };
 *     }
 *     return chunk;
 *   })
 *   .filter(excludeParts(['reasoning']))
 *   .map(({ chunk, part }) => {
 *     // part is now typed as TextPart only
 *     return chunk;
 *   })
 *   .toStream();
 *
 * // Use directly as AsyncIterable
 * for await (const chunk of pipeUIMessageStream(stream).filter(...).map(...)) {
 *   console.log(chunk);
 * }
 *
 * // Match and transform specific part types
 * const stream = pipeUIMessageStream<MyUIMessage>(inputStream)
 *   .match(isPartType('text'), (pipe) =>
 *     pipe.map(({ chunk, part }) => {
 *       // part is typed as TextPart
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
 * Helper: isPartType and isNotPartType (type guard versions)
 * ============================================================================ */

/**
 * Creates a type guard predicate that matches specific part types.
 * Use with `.match()` to process specific part types.
 *
 * The function accepts part type literals (e.g., 'text') but returns a predicate
 * typed with the actual part type (e.g., TextUIPart).
 *
 * @example
 * ```typescript
 * pipeUIMessageStream<MyUIMessage>(stream)
 *   .match(isPartType('text'), (pipe) =>
 *     pipe.map(({ chunk, part }) => {
 *       // part is typed as TextPart
 *       console.log(part.text);
 *       return chunk;
 *     })
 *   )
 *   .toStream();
 *
 * // Match multiple part types
 * .match(isPartType(['text', 'reasoning']), (pipe) => ...)
 * ```
 */
export function isPartType<
  UI_MESSAGE extends UIMessage,
  PART_TYPE extends InferUIMessagePartType<UI_MESSAGE>,
>(
  type: PART_TYPE | Array<PART_TYPE>,
): PartTypePredicate<UI_MESSAGE, ExtractPart<UI_MESSAGE, PART_TYPE>> {
  const types = Array.isArray(type) ? type : [type];
  return (part): part is ExtractPart<UI_MESSAGE, PART_TYPE> =>
    types.includes(part.type as PART_TYPE);
}

/**
 * Creates a type guard predicate that excludes specific part types.
 * Use with `.match()` to process all parts except specific types.
 *
 * The function accepts part type literals (e.g., 'text') but returns a predicate
 * typed with the actual part types that remain after exclusion.
 *
 * @example
 * ```typescript
 * pipeUIMessageStream<MyUIMessage>(stream)
 *   .match(isNotPartType('text'), (pipe) =>
 *     pipe.map(({ chunk, part }) => {
 *       // part is typed as all part types except TextPart
 *       return chunk;
 *     })
 *   )
 *   .toStream();
 *
 * // Exclude multiple part types
 * .match(isNotPartType(['text', 'reasoning']), (pipe) => ...)
 * ```
 */
export function isNotPartType<
  UI_MESSAGE extends UIMessage,
  PART_TYPE extends InferUIMessagePartType<UI_MESSAGE>,
>(
  type: PART_TYPE | Array<PART_TYPE>,
): PartTypePredicate<UI_MESSAGE, ExcludePart<UI_MESSAGE, PART_TYPE>> {
  const types = Array.isArray(type) ? type : [type];
  return (part): part is ExcludePart<UI_MESSAGE, PART_TYPE> =>
    !types.includes(part.type as PART_TYPE);
}
