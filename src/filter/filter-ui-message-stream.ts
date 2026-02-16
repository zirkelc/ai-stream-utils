import type { AsyncIterableStream, InferUIMessageChunk, UIMessage } from "ai";
import { mapUIMessageStream } from "../map/map-ui-message-stream.js";
import type { FilterGuard } from "../pipe/types.js";

/**
 * Filter function type for filterUIMessageStream.
 * Can be either a FilterGuard (from includeParts/excludeParts) or a plain predicate.
 */
type FilterFn<UI_MESSAGE extends UIMessage> =
  | FilterGuard<UI_MESSAGE, any, any>
  | ((input: { chunk: InferUIMessageChunk<UI_MESSAGE>; part: { type: string } }) => boolean);

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
  predicate: FilterFn<UI_MESSAGE>,
): AsyncIterableStream<InferUIMessageChunk<UI_MESSAGE>> {
  return mapUIMessageStream(stream, (input) => {
    return predicate(input) ? input.chunk : null;
  });
}
