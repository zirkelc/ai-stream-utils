import type {
  AsyncIterableStream,
  InferUIMessageChunk,
  UIMessage,
  UIMessageChunk,
} from 'ai';
import {
  type ChunkMapContext,
  type ChunkMapInput,
  mapUIMessageChunkStream,
} from './map-ui-message-chunk-stream.js';
import type { InferUIMessagePartType } from './types.js';

/**
 * Filter function that receives the same input/context as mapUIMessageChunkStream.
 * Return true to include the chunk, false to filter it out.
 */
export type FilterUIMessageStreamFn<UI_MESSAGE extends UIMessage> = (
  input: ChunkMapInput<UI_MESSAGE>,
  context: ChunkMapContext<UI_MESSAGE>,
) => boolean;

/**
 * Shorthand options for filtering by part type.
 */
export type FilterUIMessageStreamOptions<UI_MESSAGE extends UIMessage> =
  | {
      /**
       * Include only these part types.
       * For tools, use 'tool-<toolName>' (e.g., 'tool-weather').
       * For dynamic tools, use 'dynamic-tool'.
       */
      includeParts: Array<InferUIMessagePartType<UI_MESSAGE>>;
    }
  | {
      /**
       * Exclude these part types.
       * For tools, use 'tool-<toolName>' (e.g., 'tool-weather').
       * For dynamic tools, use 'dynamic-tool'.
       */
      excludeParts: Array<InferUIMessagePartType<UI_MESSAGE>>;
    };

/**
 * Filter argument - either a filter function or shorthand options.
 */
export type FilterUIMessageStreamFilter<UI_MESSAGE extends UIMessage> =
  | FilterUIMessageStreamFn<UI_MESSAGE>
  | FilterUIMessageStreamOptions<UI_MESSAGE>;

/**
 * Filters a UIMessageStream to include or exclude specific chunks.
 *
 * This is a convenience wrapper around `mapUIMessageChunkStream` that provides
 * a simpler API for filtering chunks.
 *
 * The filter can be:
 * - A function that receives `{ chunk, part }` and `{ index, chunks }` and returns boolean
 * - An object with `includeParts` array to include only specific part types
 * - An object with `excludeParts` array to exclude specific part types
 *
 * Meta chunks (start, finish, abort, message-metadata, error) always pass through.
 * Step boundaries (start-step, finish-step) are handled automatically.
 *
 * @example
 * ```typescript
 * // Filter function - include only text parts
 * const stream = filterUIMessageStream(
 *   result.toUIMessageStream(),
 *   ({ part }) => part.type === 'text'
 * );
 *
 * // Filter function with context - skip first chunk of each part
 * const stream = filterUIMessageStream(
 *   result.toUIMessageStream(),
 *   ({ chunk }, { index }) => index > 0
 * );
 *
 * // Shorthand - include only specific parts
 * const stream = filterUIMessageStream(
 *   result.toUIMessageStream(),
 *   { includeParts: ['text', 'tool-weather'] }
 * );
 *
 * // Shorthand - exclude specific parts
 * const stream = filterUIMessageStream(
 *   result.toUIMessageStream(),
 *   { excludeParts: ['reasoning', 'tool-calculator'] }
 * );
 * ```
 */
export function filterUIMessageStream<UI_MESSAGE extends UIMessage>(
  stream: ReadableStream<UIMessageChunk>,
  filter: FilterUIMessageStreamFilter<UI_MESSAGE>,
): AsyncIterableStream<InferUIMessageChunk<UI_MESSAGE>> {
  // Convert filter to a predicate function
  const shouldInclude = createFilterPredicate(filter);

  return mapUIMessageChunkStream(stream, (input, context) => {
    return shouldInclude(input, context) ? input.chunk : null;
  });
}

/**
 * Creates a filter predicate from the filter argument.
 */
function createFilterPredicate<UI_MESSAGE extends UIMessage>(
  filter: FilterUIMessageStreamFilter<UI_MESSAGE>,
): FilterUIMessageStreamFn<UI_MESSAGE> {
  // If it's a function, use it directly
  if (typeof filter === 'function') {
    return filter;
  }

  // If it's includeParts, create a set-based filter
  if ('includeParts' in filter) {
    const includeSet = new Set(filter.includeParts);
    return ({ part }) => {
      const partType = part.type as InferUIMessagePartType<UI_MESSAGE>;
      return includeSet.has(partType);
    };
  }

  // If it's excludeParts, create a set-based filter
  const excludeSet = new Set(filter.excludeParts);
  return ({ part }) => {
    const partType = part.type as InferUIMessagePartType<UI_MESSAGE>;
    return !excludeSet.has(partType);
  };
}
