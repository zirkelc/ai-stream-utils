import type { AsyncIterableStream, InferUIMessageChunk, UIMessage } from 'ai';
import { mapUIMessageStream } from './map-ui-message-stream.js';
import type {
  ExcludePart,
  ExtractPart,
  InferUIMessagePart,
  InferUIMessagePartType,
} from './types.js';

/**
 * Unique symbol for type branding filter predicates.
 * This symbol only exists in the type system and is used to carry
 * the narrowed part type through the pipeline.
 */
declare const FilterPredicatePartType: unique symbol;

/**
 * Filter predicate for UIMessageStream filtering.
 *
 * Uses a unique symbol to carry type information for narrowing.
 * When used with `includeParts()` or `excludeParts()`, the narrowed type flows through
 * the pipeline to subsequent operations.
 *
 * - When `NARROWED_PART` is explicitly set (via `includeParts`/`excludeParts`), it narrows the type
 * - When `NARROWED_PART` uses the default, it represents "all parts" (no narrowing)
 */
export type FilterPredicate<
  UI_MESSAGE extends UIMessage,
  NARROWED_PART extends
    InferUIMessagePart<UI_MESSAGE> = InferUIMessagePart<UI_MESSAGE>,
> = ((input: {
  chunk: InferUIMessageChunk<UI_MESSAGE>;
  part: { type: string };
}) => boolean) & {
  readonly [FilterPredicatePartType]?: NARROWED_PART;
};

/**
 * @deprecated Use `FilterPredicate` instead. This alias is kept for backward compatibility.
 */
export type FilterUIMessageStreamPredicate<
  UI_MESSAGE extends UIMessage,
  PART extends InferUIMessagePart<UI_MESSAGE> = InferUIMessagePart<UI_MESSAGE>,
> = FilterPredicate<UI_MESSAGE, PART>;

/* ============================================================================
 * Helper Functions
 * ============================================================================ */

/**
 * Creates a typed filter predicate that includes only the specified part types.
 * The returned predicate carries type information that narrows the part type
 * in subsequent pipeline operations.
 *
 * @example
 * ```typescript
 * // Standalone usage
 * filterUIMessageStream(stream, includeParts(['text', 'tool-weather']));
 *
 * // Pipeline usage - part type is narrowed in subsequent .map()
 * pipeUIMessageStream<MyUIMessage>(stream)
 *   .filter(includeParts(['text', 'reasoning']))
 *   .map(({ chunk, part }) => {
 *     // part is typed as TextPart | ReasoningPart
 *     return chunk;
 *   });
 * ```
 */
export function includeParts<
  UI_MESSAGE extends UIMessage,
  PART_TYPE extends InferUIMessagePartType<UI_MESSAGE>,
>(
  includePartTypes: Array<PART_TYPE>,
): FilterPredicate<UI_MESSAGE, ExtractPart<UI_MESSAGE, PART_TYPE>> {
  const predicate = ({ part }: { part: { type: string } }) => {
    return includePartTypes.includes(part.type as PART_TYPE);
  };

  return predicate as FilterPredicate<
    UI_MESSAGE,
    ExtractPart<UI_MESSAGE, PART_TYPE>
  >;
}

/**
 * Creates a typed filter predicate that excludes the specified part types.
 * The returned predicate carries type information that narrows the part type
 * in subsequent pipeline operations.
 *
 * @example
 * ```typescript
 * // Standalone usage
 * filterUIMessageStream(stream, excludeParts(['reasoning', 'tool-calculator']));
 *
 * // Pipeline usage - part type is narrowed in subsequent .map()
 * pipeUIMessageStream<MyUIMessage>(stream)
 *   .filter(excludeParts(['reasoning']))
 *   .map(({ chunk, part }) => {
 *     // part is typed as all parts except ReasoningPart
 *     return chunk;
 *   });
 * ```
 */
export function excludeParts<
  UI_MESSAGE extends UIMessage,
  PART_TYPE extends InferUIMessagePartType<UI_MESSAGE>,
>(
  excludePartTypes: Array<PART_TYPE>,
): FilterPredicate<UI_MESSAGE, ExcludePart<UI_MESSAGE, PART_TYPE>> {
  const predicate = ({ part }: { part: { type: string } }) => {
    return !excludePartTypes.includes(part.type as PART_TYPE);
  };

  return predicate as FilterPredicate<
    UI_MESSAGE,
    ExcludePart<UI_MESSAGE, PART_TYPE>
  >;
}

/**
 * Filters a UIMessageStream to include or exclude specific chunks.
 *
 * This is a convenience wrapper around `mapUIMessageStream` that provides
 * a simpler API for filtering chunks.
 *
 * The filter function receives `{ chunk, part }` and returns a boolean indicating
 * whether to include the chunk.
 *
 * Use the `includeParts()` and `excludeParts()` helper functions for common filtering patterns.
 *
 * Meta chunks (start, finish, abort, message-metadata, error) always pass through.
 * Step boundaries (start-step, finish-step) are handled automatically.
 *
 * @example
 * ```typescript
 * // Custom filter function - include only text parts
 * const stream = filterUIMessageStream(
 *   result.toUIMessageStream(),
 *   ({ part }) => part.type === 'text'
 * );
 *
 * // Using includeParts helper
 * const stream = filterUIMessageStream(
 *   result.toUIMessageStream(),
 *   includeParts(['text', 'tool-weather'])
 * );
 *
 * // Using excludeParts helper
 * const stream = filterUIMessageStream(
 *   result.toUIMessageStream(),
 *   excludeParts(['reasoning', 'tool-calculator'])
 * );
 * ```
 */
export function filterUIMessageStream<UI_MESSAGE extends UIMessage>(
  stream: ReadableStream<InferUIMessageChunk<UI_MESSAGE>>,
  predicate: FilterPredicate<UI_MESSAGE>,
): AsyncIterableStream<InferUIMessageChunk<UI_MESSAGE>> {
  return mapUIMessageStream(stream, (input) => {
    return predicate(input) ? input.chunk : null;
  });
}
