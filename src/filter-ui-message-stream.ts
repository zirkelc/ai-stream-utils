import type {
  AsyncIterableStream,
  InferUIMessageChunk,
  UIMessage,
  UIMessageChunk,
} from 'ai';
import { createAsyncIterableStream } from './create-async-iterable-stream.js';
import type { InferUIMessagePartType } from './types.js';

export type FilterUIMessageStreamOptions<UI_MESSAGE extends UIMessage> =
  | {
      /**
       * Custom filter function. Receives an object with the part type and returns whether to include it.
       * For tool chunks, the type is the tool-specific part type (e.g., 'tool-weather').
       * For dynamic tools, the type is 'dynamic-tool'.
       */
      filterParts: (options: {
        partType: InferUIMessagePartType<UI_MESSAGE>;
      }) => boolean;
    }
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
 * Maps a chunk type to its corresponding UI message part type.
 * For tool-related chunks that have complete info, returns 'tool-{toolName}' or 'dynamic-tool'.
 * For other chunks, returns a placeholder that will be resolved using state tracking.
 */
function getPartTypeFromChunk(chunk: UIMessageChunk): string {
  switch (chunk.type) {
    case 'tool-input-start':
      return chunk.dynamic ? 'dynamic-tool' : `tool-${chunk.toolName}`;

    case 'tool-input-available':
    case 'tool-input-error':
      return chunk.dynamic ? 'dynamic-tool' : `tool-${chunk.toolName}`;

    case 'start-step':
      return 'step-start';

    case 'text-start':
    case 'text-delta':
    case 'text-end':
      return 'text';

    case 'reasoning-start':
    case 'reasoning-delta':
    case 'reasoning-end':
      return 'reasoning';

    case 'file':
      return 'file';

    case 'source-url':
      return 'source-url';

    case 'source-document':
      return 'source-document';

    case 'start':
    case 'finish':
    case 'abort':
    case 'message-metadata':
    case 'error':
      return chunk.type;

    default:
      // For data-* chunks and other types, use the chunk type directly
      // For tool chunks without complete info, return placeholder
      return chunk.type;
  }
}

/**
 * Creates a filter function from the options.
 */
function createFilterFunction<UI_MESSAGE extends UIMessage>(
  options: FilterUIMessageStreamOptions<UI_MESSAGE>,
): (partType: InferUIMessagePartType<UI_MESSAGE>) => boolean {
  if ('filterParts' in options) {
    return (partType: InferUIMessagePartType<UI_MESSAGE>) =>
      options.filterParts({ partType });
  }

  if ('includeParts' in options) {
    const includeSet = new Set(options.includeParts);
    return (partType: InferUIMessagePartType<UI_MESSAGE>) =>
      includeSet.has(partType);
  }

  // excludeParts
  const excludeSet = new Set(options.excludeParts);
  return (partType: InferUIMessagePartType<UI_MESSAGE>) =>
    !excludeSet.has(partType);
}

/**
 * State for tracking tool calls across chunks.
 */
type ToolCallState = {
  toolName: string;
  dynamic: boolean | undefined;
};

/**
 * Filters a UIMessageStream to include or exclude specific part types.
 *
 * This function buffers `start-step` chunks and only enqueues them if the
 * subsequent content in that step passes the filter. Similarly, `finish-step`
 * is only enqueued if the corresponding `start-step` was enqueued.
 *
 * @example
 * ```typescript
 * // Include only text and specific tools
 * const stream = filterUIMessageStream(
 *   result.toUIMessageStream(),
 *   {
 *     includeParts: ['text', 'tool-weather', 'tool-search']
 *   }
 * );
 *
 * // Exclude reasoning and specific tools
 * const stream = filterUIMessageStream(
 *   result.toUIMessageStream(),
 *   {
 *     excludeParts: ['reasoning', 'tool-calculator']
 *   }
 * );
 *
 * // Custom filter function
 * const stream = filterUIMessageStream(
 *   result.toUIMessageStream(),
 *   {
 *     filterParts: ({ partType }) => {
 *       if (partType.startsWith('tool-')) {
 *         return partType.includes('weather');
 *       }
 *       return true;
 *     }
 *   }
 * );
 * ```
 */
export function filterUIMessageStream<UI_MESSAGE extends UIMessage>(
  stream: ReadableStream<UIMessageChunk>,
  options: FilterUIMessageStreamOptions<UI_MESSAGE>,
): AsyncIterableStream<InferUIMessageChunk<UI_MESSAGE>> {
  const shouldIncludePartType = createFilterFunction(options);

  // State for the transform stream
  let bufferedStartStep: InferUIMessageChunk<UI_MESSAGE> | undefined;
  let stepStartEnqueued = false;
  let stepHasContent = false;
  const toolCallStates = new Map<string, ToolCallState>();

  const transformStream = new TransformStream<
    InferUIMessageChunk<UI_MESSAGE>,
    InferUIMessageChunk<UI_MESSAGE>
  >({
    transform(chunk, controller) {
      const chunkType = chunk.type;

      switch (chunkType) {
        case 'tool-input-start': {
          const toolChunk = chunk as {
            type: 'tool-input-start';
            toolCallId: string;
            toolName: string;
            dynamic?: boolean;
          };
          // Track tool call state for later lookups
          toolCallStates.set(toolChunk.toolCallId, {
            toolName: toolChunk.toolName,
            dynamic: toolChunk.dynamic,
          });

          // Apply filter
          const partType = getPartTypeFromChunk(
            chunk,
          ) as InferUIMessagePartType<UI_MESSAGE>;
          const shouldInclude = shouldIncludePartType(partType);

          if (bufferedStartStep && !stepHasContent) {
            stepHasContent = true;
            if (shouldInclude) {
              controller.enqueue(bufferedStartStep);
              stepStartEnqueued = true;
              bufferedStartStep = undefined;
            }
          }

          if (shouldInclude) {
            controller.enqueue(chunk);
          }
          break;
        }

        case 'start-step': {
          // Buffer start-step until we know if content will be included
          bufferedStartStep = chunk;
          stepHasContent = false;
          break;
        }

        case 'finish-step': {
          // Only enqueue if corresponding start-step was enqueued
          if (stepStartEnqueued) {
            controller.enqueue(chunk);
            stepStartEnqueued = false;
          }
          bufferedStartStep = undefined;
          break;
        }

        case 'start':
        case 'finish':
        case 'abort':
        case 'message-metadata':
        case 'error': {
          // Always pass through meta chunks
          controller.enqueue(chunk);
          break;
        }

        case 'tool-input-delta': {
          const toolChunk = chunk as {
            type: 'tool-input-delta';
            toolCallId: string;
          };
          const toolState = toolCallStates.get(toolChunk.toolCallId);
          const partType = toolState
            ? toolState.dynamic
              ? 'dynamic-tool'
              : `tool-${toolState.toolName}`
            : getPartTypeFromChunk(chunk);

          const shouldInclude = shouldIncludePartType(
            partType as InferUIMessagePartType<UI_MESSAGE>,
          );

          if (bufferedStartStep && !stepHasContent) {
            stepHasContent = true;
            if (shouldInclude) {
              controller.enqueue(bufferedStartStep);
              stepStartEnqueued = true;
              bufferedStartStep = undefined;
            }
          }

          if (shouldInclude) {
            controller.enqueue(chunk);
          }
          break;
        }

        case 'tool-input-available':
        case 'tool-input-error': {
          // These have toolName directly on the chunk
          const partType = getPartTypeFromChunk(chunk);
          const shouldInclude = shouldIncludePartType(
            partType as InferUIMessagePartType<UI_MESSAGE>,
          );

          if (bufferedStartStep && !stepHasContent) {
            stepHasContent = true;
            if (shouldInclude) {
              controller.enqueue(bufferedStartStep);
              stepStartEnqueued = true;
              bufferedStartStep = undefined;
            }
          }

          if (shouldInclude) {
            controller.enqueue(chunk);
          }
          break;
        }

        case 'tool-output-available':
        case 'tool-output-error': {
          const toolChunk = chunk as {
            type: 'tool-output-available' | 'tool-output-error';
            toolCallId: string;
          };
          const toolState = toolCallStates.get(toolChunk.toolCallId);
          const partType = toolState
            ? toolState.dynamic
              ? 'dynamic-tool'
              : `tool-${toolState.toolName}`
            : getPartTypeFromChunk(chunk);

          const shouldInclude = shouldIncludePartType(
            partType as InferUIMessagePartType<UI_MESSAGE>,
          );

          if (bufferedStartStep && !stepHasContent) {
            stepHasContent = true;
            if (shouldInclude) {
              controller.enqueue(bufferedStartStep);
              stepStartEnqueued = true;
              bufferedStartStep = undefined;
            }
          }

          if (shouldInclude) {
            controller.enqueue(chunk);
          }
          break;
        }

        case 'text-start':
        case 'text-delta':
        case 'text-end':
        case 'reasoning-start':
        case 'reasoning-delta':
        case 'reasoning-end':
        case 'file':
        case 'source-url':
        case 'source-document': {
          const partType = getPartTypeFromChunk(chunk);
          const shouldInclude = shouldIncludePartType(
            partType as InferUIMessagePartType<UI_MESSAGE>,
          );

          if (bufferedStartStep && !stepHasContent) {
            stepHasContent = true;
            if (shouldInclude) {
              controller.enqueue(bufferedStartStep);
              stepStartEnqueued = true;
              bufferedStartStep = undefined;
            }
          }

          if (shouldInclude) {
            controller.enqueue(chunk);
          }
          break;
        }

        default: {
          // Handle data-* chunks and any future chunk types
          const partType = getPartTypeFromChunk(chunk);
          const shouldInclude = shouldIncludePartType(
            partType as InferUIMessagePartType<UI_MESSAGE>,
          );

          if (bufferedStartStep && !stepHasContent) {
            stepHasContent = true;
            if (shouldInclude) {
              controller.enqueue(bufferedStartStep);
              stepStartEnqueued = true;
              bufferedStartStep = undefined;
            }
          }

          if (shouldInclude) {
            controller.enqueue(chunk);
          }
          break;
        }
      }
    },

    flush() {
      // Clean up state
      bufferedStartStep = undefined;
      stepStartEnqueued = false;
      stepHasContent = false;
      toolCallStates.clear();
    },
  });

  return createAsyncIterableStream(stream.pipeThrough(transformStream));
}
