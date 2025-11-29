import type {
  AsyncIterableStream,
  InferUIMessageChunk,
  UIMessage,
  UIMessageChunk,
} from 'ai';
import { createAsyncIterableStream } from './create-async-iterable-stream.js';
import {
  isMetaChunk,
  isStepEndChunk,
  isStepStartChunk,
  resolveToolPartType,
  type ToolCallState,
} from './stream-utils.js';
import type { InferUIMessagePart, InferUIMessagePartType } from './types.js';

/**
 * A partial part reconstructed from the current chunk.
 * Contains the part type and any available data from the chunk.
 */
export type PartialPart<UI_MESSAGE extends UIMessage> = {
  /** The part type (e.g., 'text', 'reasoning', 'tool-weather', 'file') */
  type: InferUIMessagePartType<UI_MESSAGE>;
} & Partial<InferUIMessagePart<UI_MESSAGE>>;

/**
 * Input object provided to the chunk map function.
 */
export type ChunkMapInput<UI_MESSAGE extends UIMessage> = {
  /** The current chunk */
  chunk: InferUIMessageChunk<UI_MESSAGE>;
  /**
   * A partial representation of the part this chunk belongs to.
   * Use `part.type` to determine the part type.
   */
  part: PartialPart<UI_MESSAGE>;
};

/**
 * Context provided to the chunk map function (similar to Array.map callback).
 */
export type ChunkMapContext<UI_MESSAGE extends UIMessage> = {
  /** The index of the current chunk in the stream (0-based) */
  index: number;
  /** All chunks seen so far (including the current one) */
  chunks: InferUIMessageChunk<UI_MESSAGE>[];
};

/**
 * Map function for chunk-level transformation.
 * Similar to Array.map, receives the input object and context.
 * Return the chunk (possibly transformed) to include it, or null to filter it out.
 */
export type MapUIMessageChunkFn<UI_MESSAGE extends UIMessage> = (
  input: ChunkMapInput<UI_MESSAGE>,
  context: ChunkMapContext<UI_MESSAGE>,
) => InferUIMessageChunk<UI_MESSAGE> | null;

/**
 * Maps/filters a UIMessageStream at the chunk level.
 *
 * This function processes each chunk as it arrives and allows you to:
 * - Transform chunks by returning a modified chunk
 * - Filter out chunks by returning null
 *
 * Meta chunks (start, finish, abort, message-metadata, error) always pass through.
 * Step boundaries (start-step, finish-step) are handled automatically:
 * - start-step is buffered and only emitted if subsequent content is included
 * - finish-step is only emitted if the corresponding start-step was emitted
 *
 * @example
 * ```typescript
 * // Filter out reasoning chunks using part.type
 * const stream = mapUIMessageChunkStream(
 *   inputStream,
 *   ({ chunk, part }) => part.type === 'reasoning' ? null : chunk
 * );
 *
 * // Transform text chunks
 * const stream = mapUIMessageChunkStream(
 *   inputStream,
 *   ({ chunk, part }) => {
 *     if (chunk.type === 'text-delta') {
 *       return { ...chunk, delta: chunk.delta.toUpperCase() };
 *     }
 *     return chunk;
 *   }
 * );
 *
 * // Access previous chunks and index
 * const stream = mapUIMessageChunkStream(
 *   inputStream,
 *   ({ chunk }, { index, chunks }) => {
 *     console.log(`Processing chunk ${index} of ${chunks.length}`);
 *     return chunk;
 *   }
 * );
 * ```
 */
export function mapUIMessageChunkStream<UI_MESSAGE extends UIMessage>(
  stream: ReadableStream<UIMessageChunk>,
  mapFn: MapUIMessageChunkFn<UI_MESSAGE>,
): AsyncIterableStream<InferUIMessageChunk<UI_MESSAGE>> {
  // State for the transform stream
  let bufferedStartStep: InferUIMessageChunk<UI_MESSAGE> | undefined;
  let stepStartEnqueued = false;
  let stepHasContent = false;
  const toolCallStates = new Map<string, ToolCallState>();

  // Track all chunks and current index
  const allChunks: InferUIMessageChunk<UI_MESSAGE>[] = [];
  let currentIndex = 0;

  const transformStream = new TransformStream<
    InferUIMessageChunk<UI_MESSAGE>,
    InferUIMessageChunk<UI_MESSAGE>
  >({
    transform(chunk, controller) {
      // Add chunk to history
      allChunks.push(chunk);
      const index = currentIndex++;

      // Always pass through meta chunks
      if (isMetaChunk(chunk)) {
        controller.enqueue(chunk);
        return;
      }

      // Buffer start-step until we know if content will be included
      if (isStepStartChunk(chunk)) {
        bufferedStartStep = chunk;
        stepHasContent = false;
        return;
      }

      // Only enqueue finish-step if corresponding start-step was enqueued
      if (isStepEndChunk(chunk)) {
        if (stepStartEnqueued) {
          controller.enqueue(chunk);
          stepStartEnqueued = false;
        }
        bufferedStartStep = undefined;
        return;
      }

      // Track tool call state for later lookups
      if (chunk.type === 'tool-input-start') {
        const toolChunk = chunk as {
          type: 'tool-input-start';
          toolCallId: string;
          toolName: string;
          dynamic?: boolean;
        };
        toolCallStates.set(toolChunk.toolCallId, {
          toolName: toolChunk.toolName,
          dynamic: toolChunk.dynamic,
        });
      }

      // Resolve part type
      const partType = resolveToolPartType(
        chunk,
        toolCallStates,
      ) as InferUIMessagePartType<UI_MESSAGE>;

      // Build partial part from chunk
      const part = buildPartialPart(chunk, partType, toolCallStates);

      // Apply the map function
      const result = mapFn(
        { chunk, part: part as PartialPart<UI_MESSAGE> },
        { index, chunks: allChunks },
      );

      // If result is null, filter out this chunk
      if (result === null) {
        return;
      }

      // Handle buffered start-step
      if (bufferedStartStep && !stepHasContent) {
        stepHasContent = true;
        controller.enqueue(bufferedStartStep);
        stepStartEnqueued = true;
        bufferedStartStep = undefined;
      }

      controller.enqueue(result);
    },

    flush() {
      // Clean up state
      bufferedStartStep = undefined;
      stepStartEnqueued = false;
      stepHasContent = false;
      toolCallStates.clear();
      allChunks.length = 0;
      currentIndex = 0;
    },
  });

  return createAsyncIterableStream(stream.pipeThrough(transformStream));
}

/**
 * Builds a partial part representation from a chunk.
 * This provides access to the part type and any available metadata.
 */
function buildPartialPart(
  chunk: UIMessageChunk,
  partType: string,
  toolCallStates: Map<string, ToolCallState>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { type: partType };

  switch (chunk.type) {
    // Text chunks
    case 'text-start':
    case 'text-delta':
    case 'text-end': {
      const textChunk = chunk as {
        id: string;
        delta?: string;
        providerMetadata?: unknown;
      };
      result.id = textChunk.id;
      if (textChunk.delta !== undefined) result.text = textChunk.delta;
      if (textChunk.providerMetadata)
        result.providerMetadata = textChunk.providerMetadata;
      break;
    }

    // Reasoning chunks
    case 'reasoning-start':
    case 'reasoning-delta':
    case 'reasoning-end': {
      const reasoningChunk = chunk as {
        id: string;
        delta?: string;
        providerMetadata?: unknown;
      };
      result.id = reasoningChunk.id;
      if (reasoningChunk.delta !== undefined)
        result.text = reasoningChunk.delta;
      if (reasoningChunk.providerMetadata)
        result.providerMetadata = reasoningChunk.providerMetadata;
      break;
    }

    // Tool chunks
    case 'tool-input-start': {
      const toolChunk = chunk as {
        toolCallId: string;
        toolName: string;
        dynamic?: boolean;
        providerExecuted?: boolean;
      };
      result.toolCallId = toolChunk.toolCallId;
      result.toolName = toolChunk.toolName;
      result.providerExecuted = toolChunk.providerExecuted;
      break;
    }

    case 'tool-input-delta': {
      const toolChunk = chunk as { toolCallId: string; inputTextDelta: string };
      const toolState = toolCallStates.get(toolChunk.toolCallId);
      result.toolCallId = toolChunk.toolCallId;
      result.toolName = toolState?.toolName;
      result.inputTextDelta = toolChunk.inputTextDelta;
      break;
    }

    case 'tool-input-available': {
      const toolChunk = chunk as {
        toolCallId: string;
        toolName: string;
        input: unknown;
        providerExecuted?: boolean;
        providerMetadata?: unknown;
        dynamic?: boolean;
      };
      result.toolCallId = toolChunk.toolCallId;
      result.toolName = toolChunk.toolName;
      result.input = toolChunk.input;
      result.state = 'input-available';
      result.providerExecuted = toolChunk.providerExecuted;
      if (toolChunk.providerMetadata)
        result.callProviderMetadata = toolChunk.providerMetadata;
      break;
    }

    case 'tool-input-error': {
      const toolChunk = chunk as {
        toolCallId: string;
        toolName: string;
        input: unknown;
        errorText: string;
        providerExecuted?: boolean;
        dynamic?: boolean;
      };
      result.toolCallId = toolChunk.toolCallId;
      result.toolName = toolChunk.toolName;
      result.input = toolChunk.input;
      result.errorText = toolChunk.errorText;
      result.state = 'output-error';
      result.providerExecuted = toolChunk.providerExecuted;
      break;
    }

    case 'tool-output-available': {
      const toolChunk = chunk as {
        toolCallId: string;
        output: unknown;
        providerExecuted?: boolean;
        preliminary?: boolean;
        dynamic?: boolean;
      };
      const toolState = toolCallStates.get(toolChunk.toolCallId);
      result.toolCallId = toolChunk.toolCallId;
      result.toolName = toolState?.toolName;
      result.output = toolChunk.output;
      result.state = 'output-available';
      result.providerExecuted = toolChunk.providerExecuted;
      result.preliminary = toolChunk.preliminary;
      break;
    }

    case 'tool-output-error': {
      const toolChunk = chunk as {
        toolCallId: string;
        errorText: string;
        providerExecuted?: boolean;
        dynamic?: boolean;
      };
      const toolState = toolCallStates.get(toolChunk.toolCallId);
      result.toolCallId = toolChunk.toolCallId;
      result.toolName = toolState?.toolName;
      result.errorText = toolChunk.errorText;
      result.state = 'output-error';
      result.providerExecuted = toolChunk.providerExecuted;
      break;
    }

    // Single-chunk parts
    case 'file': {
      const fileChunk = chunk as {
        url: string;
        mediaType: string;
        providerMetadata?: unknown;
      };
      result.url = fileChunk.url;
      result.mediaType = fileChunk.mediaType;
      if (fileChunk.providerMetadata)
        result.providerMetadata = fileChunk.providerMetadata;
      break;
    }

    case 'source-url': {
      const sourceChunk = chunk as {
        sourceId: string;
        url: string;
        title?: string;
        providerMetadata?: unknown;
      };
      result.sourceId = sourceChunk.sourceId;
      result.url = sourceChunk.url;
      result.title = sourceChunk.title;
      if (sourceChunk.providerMetadata)
        result.providerMetadata = sourceChunk.providerMetadata;
      break;
    }

    case 'source-document': {
      const sourceChunk = chunk as {
        sourceId: string;
        mediaType: string;
        title: string;
        filename?: string;
        providerMetadata?: unknown;
      };
      result.sourceId = sourceChunk.sourceId;
      result.mediaType = sourceChunk.mediaType;
      result.title = sourceChunk.title;
      result.filename = sourceChunk.filename;
      if (sourceChunk.providerMetadata)
        result.providerMetadata = sourceChunk.providerMetadata;
      break;
    }

    default: {
      // Data chunks and other types
      if (chunk.type.startsWith('data-')) {
        const dataChunk = chunk as { data: unknown };
        result.data = dataChunk.data;
      }
      break;
    }
  }

  return result;
}
