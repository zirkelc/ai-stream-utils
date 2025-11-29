import type {
  AsyncIterableStream,
  InferUIMessageChunk,
  UIMessage,
  UIMessageChunk,
} from 'ai';
import { createAsyncIterableStream } from './create-async-iterable-stream.js';
import {
  isMetaChunk,
  isPartEndChunk,
  isPartStartChunk,
  isStepEndChunk,
  isStepStartChunk,
  resolveToolPartType,
  type ToolCallState,
} from './stream-utils.js';
import type { InferUIMessagePart, InferUIMessagePartType } from './types.js';

/**
 * Input object provided to the part flatMap function.
 */
export type PartFlatMapInput<UI_MESSAGE extends UIMessage> = {
  /** The reconstructed part (use part.type to get the part type) */
  part: InferUIMessagePart<UI_MESSAGE>;
  /** The original chunks that make up this part */
  chunks: InferUIMessageChunk<UI_MESSAGE>[];
};

/**
 * Context provided to the part flatMap function (similar to Array.map callback).
 */
export type PartFlatMapContext<UI_MESSAGE extends UIMessage> = {
  /** The index of the current part in the stream (0-based) */
  index: number;
  /** All parts seen so far (including the current one) */
  parts: PartFlatMapInput<UI_MESSAGE>[];
};

/**
 * FlatMap function for part-level transformation.
 * Similar to Array.flatMap, receives the input object, index, and array of all parts.
 * Return:
 * - The part (possibly transformed) to include it
 * - An array of parts to expand into multiple parts
 * - null to filter out the part
 */
export type FlatMapUIMessagePartFn<UI_MESSAGE extends UIMessage> = (
  input: PartFlatMapInput<UI_MESSAGE>,
  context: PartFlatMapContext<UI_MESSAGE>,
) => InferUIMessagePart<UI_MESSAGE> | InferUIMessagePart<UI_MESSAGE>[] | null;

/**
 * FlatMaps a UIMessageStream at the part level.
 *
 * This function buffers all chunks belonging to a part until the part is complete,
 * then invokes the flatMap function with the reconstructed part and original chunks.
 *
 * Meta chunks (start, finish, abort, message-metadata, error) always pass through immediately.
 * Step boundaries (start-step, finish-step) are handled automatically.
 *
 * @example
 * ```typescript
 * // Filter out reasoning parts using part.type
 * const stream = flatMapUIMessagePartStream(
 *   inputStream,
 *   ({ part }) => part.type === 'reasoning' ? null : part
 * );
 *
 * // Transform text parts
 * const stream = flatMapUIMessagePartStream(
 *   inputStream,
 *   ({ part, chunks }) => {
 *     if (part.type === 'text') {
 *       return { ...part, text: part.text.toUpperCase() };
 *     }
 *     return part;
 *   }
 * );
 *
 * // Split a text part into multiple parts
 * const stream = flatMapUIMessagePartStream(
 *   inputStream,
 *   ({ part }, { partType }) => {
 *     if (partType === 'text' && part.text.includes('\n\n')) {
 *       return part.text.split('\n\n').map(text => ({ ...part, text }));
 *     }
 *     return part;
 *   }
 * );
 * ```
 */
export function flatMapUIMessagePartStream<UI_MESSAGE extends UIMessage>(
  stream: ReadableStream<UIMessageChunk>,
  flatMapFn: FlatMapUIMessagePartFn<UI_MESSAGE>,
): AsyncIterableStream<InferUIMessageChunk<UI_MESSAGE>> {
  // State for the transform stream
  let bufferedStartStep: InferUIMessageChunk<UI_MESSAGE> | undefined;
  let stepStartEnqueued = false;
  let stepHasContent = false;
  const toolCallStates = new Map<string, ToolCallState>();

  // Current part being collected
  let currentPartChunks: InferUIMessageChunk<UI_MESSAGE>[] = [];
  let currentPartType: string | undefined;

  // Track all parts and current index
  const allParts: PartFlatMapInput<UI_MESSAGE>[] = [];
  let currentIndex = 0;

  const transformStream = new TransformStream<
    InferUIMessageChunk<UI_MESSAGE>,
    InferUIMessageChunk<UI_MESSAGE>
  >({
    transform(chunk, controller) {
      // Always pass through meta chunks immediately
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
      const partType = resolveToolPartType(chunk, toolCallStates);

      // Handle part start: begin collecting a new part
      if (isPartStartChunk(chunk)) {
        // If we were already collecting a part, something is wrong - emit what we have
        if (currentPartChunks.length > 0) {
          flushCurrentPart(controller, bufferedStartStep);
        }
        currentPartChunks = [chunk];
        currentPartType = partType;
      } else if (currentPartChunks.length > 0) {
        // Continue collecting the current part
        currentPartChunks.push(chunk);
      } else {
        // Orphan chunk - shouldn't happen normally, but pass it through
        currentPartChunks = [chunk];
        currentPartType = partType;
      }

      // Check if the part is complete
      if (isPartEndChunk(chunk)) {
        flushCurrentPart(controller, bufferedStartStep);
      }
    },

    flush(controller) {
      // Flush any remaining part
      if (currentPartChunks.length > 0) {
        flushCurrentPart(controller, bufferedStartStep);
      }

      // Clean up state
      bufferedStartStep = undefined;
      stepStartEnqueued = false;
      stepHasContent = false;
      toolCallStates.clear();
      allParts.length = 0;
      currentIndex = 0;
    },
  });

  function flushCurrentPart(
    controller: TransformStreamDefaultController<
      InferUIMessageChunk<UI_MESSAGE>
    >,
    startStep: InferUIMessageChunk<UI_MESSAGE> | undefined,
  ) {
    if (currentPartChunks.length === 0) return;

    const chunks = currentPartChunks;
    const partType = currentPartType as InferUIMessagePartType<UI_MESSAGE>;
    currentPartChunks = [];
    currentPartType = undefined;

    // Reconstruct the part from chunks
    const part = reconstructPartFromChunks(
      chunks,
      partType,
    ) as InferUIMessagePart<UI_MESSAGE>;

    // Create the input object and add to history
    const input: PartFlatMapInput<UI_MESSAGE> = { part, chunks };
    allParts.push(input);
    const index = currentIndex++;

    // Apply the flatMap function
    const result = flatMapFn(input, { index, parts: allParts });

    // If result is null, filter out this part
    if (result === null) {
      return;
    }

    // Handle buffered start-step
    if (startStep && !stepHasContent) {
      stepHasContent = true;
      controller.enqueue(startStep);
      stepStartEnqueued = true;
      bufferedStartStep = undefined;
    }

    // Convert result to array for uniform handling
    const parts = Array.isArray(result) ? result : [result];

    // Emit chunks for each resulting part
    for (const resultPart of parts) {
      // If the part is unchanged, emit original chunks
      if (resultPart === part) {
        for (const chunk of chunks) {
          controller.enqueue(chunk);
        }
      } else {
        // Part was transformed - serialize it to chunks
        const newChunks = serializePartToChunks(
          resultPart,
          partType,
          chunks,
        ) as InferUIMessageChunk<UI_MESSAGE>[];
        for (const chunk of newChunks) {
          controller.enqueue(chunk);
        }
      }
    }
  }

  return createAsyncIterableStream(stream.pipeThrough(transformStream));
}

/**
 * Reconstructs a UIMessagePart from its chunks.
 */
function reconstructPartFromChunks(
  chunks: UIMessageChunk[],
  _partType: string,
): unknown {
  if (chunks.length === 0) return null;

  const firstChunk = chunks[0];
  if (!firstChunk) return null;

  // Single-chunk parts
  if (firstChunk.type === 'file') {
    const fileChunk = firstChunk as {
      type: 'file';
      mediaType: string;
      url: string;
      providerMetadata?: unknown;
    };
    return {
      type: 'file',
      mediaType: fileChunk.mediaType,
      url: fileChunk.url,
      providerMetadata: fileChunk.providerMetadata,
    };
  }

  if (firstChunk.type === 'source-url') {
    const sourceChunk = firstChunk as {
      type: 'source-url';
      sourceId: string;
      url: string;
      title?: string;
      providerMetadata?: unknown;
    };
    return {
      type: 'source-url',
      sourceId: sourceChunk.sourceId,
      url: sourceChunk.url,
      title: sourceChunk.title,
      providerMetadata: sourceChunk.providerMetadata,
    };
  }

  if (firstChunk.type === 'source-document') {
    const sourceChunk = firstChunk as {
      type: 'source-document';
      sourceId: string;
      mediaType: string;
      title: string;
      filename?: string;
      providerMetadata?: unknown;
    };
    return {
      type: 'source-document',
      sourceId: sourceChunk.sourceId,
      mediaType: sourceChunk.mediaType,
      title: sourceChunk.title,
      filename: sourceChunk.filename,
      providerMetadata: sourceChunk.providerMetadata,
    };
  }

  if (firstChunk.type.startsWith('data-')) {
    return {
      type: firstChunk.type,
      data: (firstChunk as { data: unknown }).data,
    };
  }

  // Text part
  if (firstChunk.type === 'text-start') {
    let text = '';
    let providerMetadata: unknown;
    for (const chunk of chunks) {
      if (chunk.type === 'text-delta') {
        text += (chunk as { delta: string }).delta;
      }
      if (chunk.type === 'text-end') {
        providerMetadata = (chunk as { providerMetadata?: unknown })
          .providerMetadata;
      }
    }
    return {
      type: 'text',
      text,
      state: 'done',
      providerMetadata,
    };
  }

  // Reasoning part
  if (firstChunk.type === 'reasoning-start') {
    let text = '';
    let providerMetadata: unknown;
    for (const chunk of chunks) {
      if (chunk.type === 'reasoning-delta') {
        text += (chunk as { delta: string }).delta;
      }
      if (chunk.type === 'reasoning-end') {
        providerMetadata = (chunk as { providerMetadata?: unknown })
          .providerMetadata;
      }
    }
    return {
      type: 'reasoning',
      text,
      state: 'done',
      providerMetadata,
    };
  }

  // Tool part
  if (firstChunk.type === 'tool-input-start') {
    const toolInputStart = firstChunk as {
      toolCallId: string;
      toolName: string;
      dynamic?: boolean;
      providerExecuted?: boolean;
    };

    let input: unknown;
    let output: unknown;
    let errorText: string | undefined;
    let state: string = 'input-streaming';
    let providerMetadata: unknown;
    let preliminary: boolean | undefined;

    for (const chunk of chunks) {
      if (chunk.type === 'tool-input-available') {
        input = (chunk as { input: unknown }).input;
        state = 'input-available';
        providerMetadata = (chunk as { providerMetadata?: unknown })
          .providerMetadata;
      }
      if (chunk.type === 'tool-input-error') {
        input = (chunk as { input: unknown }).input;
        errorText = (chunk as { errorText: string }).errorText;
        state = 'output-error';
      }
      if (chunk.type === 'tool-output-available') {
        output = (chunk as { output: unknown }).output;
        state = 'output-available';
        preliminary = (chunk as { preliminary?: boolean }).preliminary;
      }
      if (chunk.type === 'tool-output-error') {
        errorText = (chunk as { errorText: string }).errorText;
        state = 'output-error';
      }
    }

    // Determine the part type based on dynamic flag
    const type = toolInputStart.dynamic
      ? 'dynamic-tool'
      : `tool-${toolInputStart.toolName}`;

    const basePart = {
      type,
      toolName: toolInputStart.toolName,
      toolCallId: toolInputStart.toolCallId,
      providerExecuted: toolInputStart.providerExecuted,
    };

    if (state === 'output-available') {
      return {
        ...basePart,
        state: 'output-available',
        input,
        output,
        callProviderMetadata: providerMetadata,
        preliminary,
      };
    }
    if (state === 'output-error') {
      return {
        ...basePart,
        state: 'output-error',
        input,
        errorText,
        callProviderMetadata: providerMetadata,
      };
    }
    if (state === 'input-available') {
      return {
        ...basePart,
        state: 'input-available',
        input,
        callProviderMetadata: providerMetadata,
      };
    }
    return {
      ...basePart,
      state: 'input-streaming',
      input,
    };
  }

  // Unknown type - return first chunk as-is
  return firstChunk;
}

/**
 * Serializes a UIMessagePart back to chunks.
 * Uses original chunks as reference for IDs and metadata.
 */
function serializePartToChunks(
  part: unknown,
  _partType: string,
  originalChunks: UIMessageChunk[],
): UIMessageChunk[] {
  const typedPart = part as Record<string, unknown>;
  const type = typedPart.type as string;

  // Single-chunk parts
  if (type === 'file') {
    return [
      {
        type: 'file',
        mediaType: typedPart.mediaType as string,
        url: typedPart.url as string,
        providerMetadata: typedPart.providerMetadata,
      } as UIMessageChunk,
    ];
  }

  if (type === 'source-url') {
    return [
      {
        type: 'source-url',
        sourceId: typedPart.sourceId as string,
        url: typedPart.url as string,
        title: typedPart.title as string | undefined,
        providerMetadata: typedPart.providerMetadata,
      } as UIMessageChunk,
    ];
  }

  if (type === 'source-document') {
    return [
      {
        type: 'source-document',
        sourceId: typedPart.sourceId as string,
        mediaType: typedPart.mediaType as string,
        title: typedPart.title as string,
        filename: typedPart.filename as string | undefined,
        providerMetadata: typedPart.providerMetadata,
      } as UIMessageChunk,
    ];
  }

  if (type.startsWith('data-')) {
    return [
      {
        type,
        data: typedPart.data,
      } as UIMessageChunk,
    ];
  }

  // Get ID from original chunks
  const firstOriginal = originalChunks[0];
  const id =
    (firstOriginal as { id?: string }).id ||
    (firstOriginal as { toolCallId?: string }).toolCallId ||
    'unknown';

  // Text part
  if (type === 'text') {
    return [
      {
        type: 'text-start',
        id,
        providerMetadata: typedPart.providerMetadata,
      } as UIMessageChunk,
      {
        type: 'text-delta',
        id,
        delta: typedPart.text as string,
      } as UIMessageChunk,
      {
        type: 'text-end',
        id,
        providerMetadata: typedPart.providerMetadata,
      } as UIMessageChunk,
    ];
  }

  // Reasoning part
  if (type === 'reasoning') {
    return [
      {
        type: 'reasoning-start',
        id,
        providerMetadata: typedPart.providerMetadata,
      } as UIMessageChunk,
      {
        type: 'reasoning-delta',
        id,
        delta: typedPart.text as string,
      } as UIMessageChunk,
      {
        type: 'reasoning-end',
        id,
        providerMetadata: typedPart.providerMetadata,
      } as UIMessageChunk,
    ];
  }

  // Tool part (both static and dynamic)
  if (type.startsWith('tool-') || type === 'dynamic-tool') {
    const toolCallId = typedPart.toolCallId as string;
    const toolName = typedPart.toolName as string;
    const dynamic = type === 'dynamic-tool';
    const state = typedPart.state as string;

    const chunks: UIMessageChunk[] = [
      {
        type: 'tool-input-start',
        toolCallId,
        toolName,
        dynamic: dynamic || undefined,
        providerExecuted: typedPart.providerExecuted as boolean | undefined,
      } as UIMessageChunk,
    ];

    // Add input chunk if input is available
    if (state === 'input-available' || state === 'output-available') {
      chunks.push({
        type: 'tool-input-available',
        toolCallId,
        toolName,
        input: typedPart.input,
        dynamic: dynamic || undefined,
        providerExecuted: typedPart.providerExecuted as boolean | undefined,
        providerMetadata: typedPart.callProviderMetadata,
      } as UIMessageChunk);
    }

    // Add output chunk
    if (state === 'output-available') {
      chunks.push({
        type: 'tool-output-available',
        toolCallId,
        output: typedPart.output,
        dynamic: dynamic || undefined,
        providerExecuted: typedPart.providerExecuted as boolean | undefined,
        preliminary: typedPart.preliminary as boolean | undefined,
      } as UIMessageChunk);
    } else if (state === 'output-error') {
      chunks.push({
        type: 'tool-output-error',
        toolCallId,
        errorText: typedPart.errorText as string,
        dynamic: dynamic || undefined,
        providerExecuted: typedPart.providerExecuted as boolean | undefined,
      } as UIMessageChunk);
    }

    return chunks;
  }

  // Unknown type - return original chunks
  return originalChunks;
}
