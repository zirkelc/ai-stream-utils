import type {
  AsyncIterableStream,
  InferUIMessageChunk,
  UIMessage,
  UIMessageChunk,
} from 'ai';
import { readUIMessageStream } from 'ai';
import { createAsyncIterableStream } from './create-async-iterable-stream.js';
import {
  buildPartialPart,
  isMetaChunk,
  isPartEndChunk,
  isPartStartChunk,
  isStepEndChunk,
  isStepStartChunk,
  resolveToolPartType,
  type ToolCallState,
} from './stream-utils.js';
import type {
  InferPartialUIMessagePart,
  InferUIMessagePart,
  InferUIMessagePartType,
} from './types.js';

/**
 * Input object provided to the part flatMap function.
 */
export type FlatMapInput<
  UI_MESSAGE extends UIMessage,
  PART extends InferUIMessagePart<UI_MESSAGE> = InferUIMessagePart<UI_MESSAGE>,
> = {
  /** The reconstructed part */
  part: PART;
};

/**
 * Context provided to the part flatMap function.
 */
export type FlatMapContext<UI_MESSAGE extends UIMessage> = {
  /** The index of the current part in the stream (0-based) */
  index: number;
  /** All parts seen so far (including the current one) */
  parts: InferUIMessagePart<UI_MESSAGE>[];
};

/**
 * FlatMap function for part-level transformation.
 * Return:
 * - The part (possibly transformed) to include it
 * - null to filter out the part
 */
export type FlatMapUIMessageStreamFn<
  UI_MESSAGE extends UIMessage,
  PART extends InferUIMessagePart<UI_MESSAGE> = InferUIMessagePart<UI_MESSAGE>,
> = (
  input: FlatMapInput<UI_MESSAGE, PART>,
  context: FlatMapContext<UI_MESSAGE>,
) => PART | null;

/**
 * Predicate function to determine which parts should be buffered.
 * Receives a PartialPart built from the current chunk.
 * Returns true to buffer the part for transformation, false to pass through immediately.
 */
export type FlatMapUIMessageStreamPredicate<
  UI_MESSAGE extends UIMessage,
  PART extends InferUIMessagePart<UI_MESSAGE> = InferUIMessagePart<UI_MESSAGE>,
> = (part: InferPartialUIMessagePart<UI_MESSAGE>) => boolean;

/**
 * Creates a predicate that matches parts by their type.
 */
export function partTypeIs<
  UI_MESSAGE extends UIMessage,
  PART_TYPE extends InferUIMessagePartType<UI_MESSAGE>,
>(
  type: PART_TYPE | PART_TYPE[],
): FlatMapUIMessageStreamPredicate<
  UI_MESSAGE,
  Extract<InferUIMessagePart<UI_MESSAGE>, { type: PART_TYPE }>
> {
  const partTypes = Array.isArray(type) ? type : [type];
  return (part: InferPartialUIMessagePart<UI_MESSAGE>): boolean =>
    partTypes.includes(part.type as unknown as PART_TYPE);
}

/**
 * Checks if a part is complete based on its state.
 */
function isPartComplete(part: { type: string; state?: string }): boolean {
  if (part.type === 'step-start') return false;
  if (!('state' in part)) return true; // Single-chunk parts
  return (
    part.state === 'done' ||
    part.state === 'output-available' ||
    part.state === 'output-error'
  );
}

/**
 * FlatMaps a UIMessageStream at the part level using readUIMessageStream.
 *
 * This implementation uses a single reader approach: chunks are read once
 * and written to two streams - one for readUIMessageStream (part assembly)
 * and one for output (chunk emission).
 */
export function flatMapUIMessageStream<
  UI_MESSAGE extends UIMessage,
  PART extends InferUIMessagePart<UI_MESSAGE>,
>(
  stream: ReadableStream<InferUIMessageChunk<UI_MESSAGE>>,
  predicate: FlatMapUIMessageStreamPredicate<UI_MESSAGE, PART>,
  flatMapFn: FlatMapUIMessageStreamFn<UI_MESSAGE, PART>,
): AsyncIterableStream<InferUIMessageChunk<UI_MESSAGE>>;
export function flatMapUIMessageStream<UI_MESSAGE extends UIMessage>(
  stream: ReadableStream<InferUIMessageChunk<UI_MESSAGE>>,
  flatMapFn: FlatMapUIMessageStreamFn<UI_MESSAGE>,
): AsyncIterableStream<InferUIMessageChunk<UI_MESSAGE>>;

// Implementation
export function flatMapUIMessageStream<
  UI_MESSAGE extends UIMessage,
  PART extends InferUIMessagePart<UI_MESSAGE>,
>(
  ...args:
    | [
        ReadableStream<InferUIMessageChunk<UI_MESSAGE>>,
        FlatMapUIMessageStreamFn<UI_MESSAGE, PART>,
      ]
    | [
        ReadableStream<InferUIMessageChunk<UI_MESSAGE>>,
        FlatMapUIMessageStreamPredicate<UI_MESSAGE, PART>,
        FlatMapUIMessageStreamFn<UI_MESSAGE, PART>,
      ]
): AsyncIterableStream<InferUIMessageChunk<UI_MESSAGE>> {
  const [inputStream, predicate, flatMapFn] =
    args.length === 2
      ? [args[0], undefined, args[1]]
      : [args[0], args[1], args[2]];

  // Single reader for input stream
  const reader = inputStream.getReader();

  // Stream A: feeds readUIMessageStream for part assembly
  let uiStreamController: ReadableStreamDefaultController<
    InferUIMessageChunk<UI_MESSAGE>
  >;
  const uiStream = new ReadableStream<InferUIMessageChunk<UI_MESSAGE>>({
    start(controller) {
      uiStreamController = controller;
    },
  });

  // Start readUIMessageStream - it will assemble parts
  const uiMessages = readUIMessageStream<UI_MESSAGE>({ stream: uiStream });
  const uiMessageIterator = uiMessages[Symbol.asyncIterator]();

  // State for tracking completed parts from readUIMessageStream
  const completedParts = new Map<
    number,
    { part: InferUIMessagePart<UI_MESSAGE>; result: PART | null }
  >();
  const allParts: InferUIMessagePart<UI_MESSAGE>[] = [];
  const partCompletionState = new Map<number, boolean>();

  // Stream B: output stream
  const outputTransform = new TransformStream<
    InferUIMessageChunk<UI_MESSAGE>,
    InferUIMessageChunk<UI_MESSAGE>
  >();
  const outputWriter = outputTransform.writable.getWriter();

  // Processing state
  let bufferedStartStep: InferUIMessageChunk<UI_MESSAGE> | undefined;
  let stepStartEnqueued = false;
  let stepHasContent = false;
  let chunkPartIndex = 0;
  let bufferedChunks: InferUIMessageChunk<UI_MESSAGE>[] = [];
  let isBufferingCurrentPart = false;
  let isStreamingCurrentPart = false;
  const toolCallStates = new Map<string, ToolCallState>();
  // Track which part indices were buffered (matched predicate) vs streamed
  const bufferedPartIndices = new Set<number>();

  /**
   * Wait for a content part (by index) to be completed by readUIMessageStream.
   */
  async function waitForPart(
    contentIndex: number,
  ): Promise<
    { part: InferUIMessagePart<UI_MESSAGE>; result: PART | null } | undefined
  > {
    while (!completedParts.has(contentIndex)) {
      const { done, value: message } = await uiMessageIterator.next();
      if (done || !message) break;

      // Count content parts (excluding step-start)
      let contentPartIndex = 0;
      for (let i = 0; i < message.parts.length; i++) {
        const part = message.parts[i];
        if (!part || part.type === 'step-start') continue;

        const wasComplete = partCompletionState.get(i) ?? false;
        const isComplete = isPartComplete(
          part as { type: string; state?: string },
        );

        // Detect completion transition
        if (isComplete && !wasComplete) {
          partCompletionState.set(i, true);

          const typedPart = part as InferUIMessagePart<UI_MESSAGE>;
          allParts.push(typedPart);
          const index = allParts.length - 1;

          // Only apply flatMapFn to parts that were buffered (matched predicate)
          // Streamed parts (didn't match predicate) just get stored as-is
          const wasBuffered = bufferedPartIndices.has(contentPartIndex);
          const result: PART | null = wasBuffered
            ? ((flatMapFn as FlatMapUIMessageStreamFn<UI_MESSAGE>)(
                { part: typedPart },
                { index, parts: allParts },
              ) as PART | null)
            : (typedPart as PART);

          completedParts.set(contentPartIndex, { part: typedPart, result });
        }

        contentPartIndex++;
      }
    }

    return completedParts.get(contentIndex);
  }

  /**
   * Emit a chunk to the output stream, handling step boundary buffering.
   */
  async function emitChunk(chunk: InferUIMessageChunk<UI_MESSAGE>) {
    if (bufferedStartStep && !stepHasContent) {
      stepHasContent = true;
      await outputWriter.write(bufferedStartStep);
      stepStartEnqueued = true;
      bufferedStartStep = undefined;
    }
    await outputWriter.write(chunk);
  }

  /**
   * Emit multiple chunks to the output stream.
   */
  async function emitChunks(chunks: InferUIMessageChunk<UI_MESSAGE>[]) {
    for (const chunk of chunks) {
      await emitChunk(chunk);
    }
  }

  /**
   * Flush the buffered part: wait for completion and emit.
   */
  async function flushBufferedPart() {
    const partIndex = chunkPartIndex++;
    // Mark this part as buffered so waitForPart knows to apply flatMapFn
    bufferedPartIndices.add(partIndex);
    const chunks = bufferedChunks;
    isBufferingCurrentPart = false;
    bufferedChunks = [];

    const completed = await waitForPart(partIndex);
    if (completed) {
      const { part, result } = completed;
      if (result === null) {
        // Filtered out - don't emit anything
      } else if (result === part) {
        await emitChunks(chunks);
      } else {
        await emitChunks(
          serializePartToChunks(
            result,
            chunks,
          ) as InferUIMessageChunk<UI_MESSAGE>[],
        );
      }
    }
  }

  /**
   * Handle a chunk for output stream.
   */
  async function handleChunkForOutput(chunk: InferUIMessageChunk<UI_MESSAGE>) {
    // Meta chunks pass through immediately
    if (isMetaChunk(chunk)) {
      await outputWriter.write(chunk);
      return;
    }

    // Buffer start-step until we know if content will be included
    if (isStepStartChunk(chunk)) {
      bufferedStartStep = chunk;
      stepHasContent = false;
      return;
    }

    // Handle finish-step
    if (isStepEndChunk(chunk)) {
      if (stepStartEnqueued) {
        await outputWriter.write(chunk);
        stepStartEnqueued = false;
      }
      bufferedStartStep = undefined;
      return;
    }

    // Track tool call state for predicate checking
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

    // Start of a new part - decide whether to buffer or stream
    if (isPartStartChunk(chunk)) {
      // Resolve part type and build partial part for predicate
      const partType = resolveToolPartType(chunk, toolCallStates);
      const partialPart = buildPartialPart(
        chunk,
        partType,
        toolCallStates,
      ) as InferPartialUIMessagePart<UI_MESSAGE>;

      // Check predicate to decide: buffer or stream?
      const shouldBuffer = !predicate || predicate(partialPart);

      if (shouldBuffer) {
        // Buffer this part for flatMap processing
        isBufferingCurrentPart = true;
        isStreamingCurrentPart = false;
        bufferedChunks = [chunk];

        // Handle single-chunk parts (file, source-url, source-document, data-*)
        if (isPartEndChunk(chunk)) {
          await flushBufferedPart();
        }
      } else {
        // Stream this part through immediately (no flatMap)
        isBufferingCurrentPart = false;
        isStreamingCurrentPart = true;
        chunkPartIndex++; // Still count it for index tracking
        await emitChunk(chunk);

        // Handle single-chunk parts that are streamed through
        if (isPartEndChunk(chunk)) {
          isStreamingCurrentPart = false;
        }
      }
      return;
    }

    // Continue streaming non-matching part
    if (isStreamingCurrentPart) {
      await emitChunk(chunk);
      if (isPartEndChunk(chunk)) {
        isStreamingCurrentPart = false;
      }
      return;
    }

    // Continue buffering matching part
    if (isBufferingCurrentPart) {
      bufferedChunks.push(chunk);

      // End of part - flush buffered chunks
      if (isPartEndChunk(chunk)) {
        await flushBufferedPart();
      }
    }
  }

  /**
   * Main processing loop: read chunks from input, write to both streams.
   */
  async function processChunks() {
    try {
      while (true) {
        const { done, value: chunk } = await reader.read();
        if (done) {
          // Close the UI stream so readUIMessageStream can finish
          uiStreamController.close();
          break;
        }

        // Write to Stream A (for readUIMessageStream) - all chunks
        uiStreamController.enqueue(chunk);

        // Handle chunk for Stream B (output) - selective based on predicate
        await handleChunkForOutput(chunk);
      }

      // Drain uiMessageIterator to ensure all parts are processed
      while (true) {
        const { done } = await uiMessageIterator.next();
        if (done) break;
      }

      // Handle any remaining buffered chunks (shouldn't happen normally)
      if (isBufferingCurrentPart && bufferedChunks.length > 0) {
        const completed = completedParts.get(chunkPartIndex);
        if (completed?.result !== null && completed) {
          const { part, result } = completed;
          if (result === part) {
            await emitChunks(bufferedChunks);
          } else {
            await emitChunks(
              serializePartToChunks(
                result,
                bufferedChunks,
              ) as InferUIMessageChunk<UI_MESSAGE>[],
            );
          }
        }
      }

      // Close output stream
      await outputWriter.close();
    } catch (error) {
      // Propagate error to both streams
      uiStreamController.error(error);
      await outputWriter.abort(error);
    } finally {
      // Cleanup
      reader.releaseLock();
      completedParts.clear();
      allParts.length = 0;
      partCompletionState.clear();
      toolCallStates.clear();
      bufferedPartIndices.clear();
    }
  }

  // Start processing (fire and forget - errors will propagate through streams)
  processChunks();

  return createAsyncIterableStream(outputTransform.readable);
}

/**
 * Serializes a UIMessagePart back to chunks.
 */
function serializePartToChunks(
  part: unknown,
  originalChunks: UIMessageChunk[],
): UIMessageChunk[] {
  const p = part as Record<string, unknown>;
  const type = p.type as string;

  if (type === 'file') {
    return [
      {
        type: 'file',
        mediaType: p.mediaType,
        url: p.url,
        providerMetadata: p.providerMetadata,
      } as UIMessageChunk,
    ];
  }

  if (type === 'source-url') {
    return [
      {
        type: 'source-url',
        sourceId: p.sourceId,
        url: p.url,
        title: p.title,
        providerMetadata: p.providerMetadata,
      } as UIMessageChunk,
    ];
  }

  if (type === 'source-document') {
    return [
      {
        type: 'source-document',
        sourceId: p.sourceId,
        mediaType: p.mediaType,
        title: p.title,
        filename: p.filename,
        providerMetadata: p.providerMetadata,
      } as UIMessageChunk,
    ];
  }

  if (type.startsWith('data-')) {
    return [{ type, data: p.data } as UIMessageChunk];
  }

  const firstChunk = originalChunks[0];
  const id =
    (firstChunk as { id?: string }).id ||
    (firstChunk as { toolCallId?: string }).toolCallId ||
    'unknown';

  if (type === 'text') {
    return [
      { type: 'text-start', id, providerMetadata: p.providerMetadata },
      { type: 'text-delta', id, delta: p.text },
      { type: 'text-end', id, providerMetadata: p.providerMetadata },
    ] as UIMessageChunk[];
  }

  if (type === 'reasoning') {
    return [
      { type: 'reasoning-start', id, providerMetadata: p.providerMetadata },
      { type: 'reasoning-delta', id, delta: p.text },
      { type: 'reasoning-end', id, providerMetadata: p.providerMetadata },
    ] as UIMessageChunk[];
  }

  if (type.startsWith('tool-') || type === 'dynamic-tool') {
    const toolCallId = p.toolCallId as string;
    const toolName = p.toolName as string;
    const dynamic = type === 'dynamic-tool' || undefined;
    const state = p.state as string;

    const chunks: UIMessageChunk[] = [
      {
        type: 'tool-input-start',
        toolCallId,
        toolName,
        dynamic,
        providerExecuted: p.providerExecuted,
      } as UIMessageChunk,
    ];

    if (state === 'input-available' || state === 'output-available') {
      chunks.push({
        type: 'tool-input-available',
        toolCallId,
        toolName,
        input: p.input,
        dynamic,
        providerExecuted: p.providerExecuted,
        providerMetadata: p.callProviderMetadata,
      } as UIMessageChunk);
    }

    if (state === 'output-available') {
      chunks.push({
        type: 'tool-output-available',
        toolCallId,
        output: p.output,
        dynamic,
        providerExecuted: p.providerExecuted,
        preliminary: p.preliminary,
      } as UIMessageChunk);
    } else if (state === 'output-error') {
      chunks.push({
        type: 'tool-output-error',
        toolCallId,
        errorText: p.errorText,
        dynamic,
        providerExecuted: p.providerExecuted,
      } as UIMessageChunk);
    }

    return chunks;
  }

  return originalChunks;
}
