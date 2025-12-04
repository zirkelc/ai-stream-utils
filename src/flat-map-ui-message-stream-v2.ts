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
export type PartFlatMapInput<
  UI_MESSAGE extends UIMessage,
  PART extends InferUIMessagePart<UI_MESSAGE> = InferUIMessagePart<UI_MESSAGE>,
> = {
  /** The reconstructed part */
  part: PART;
};

/**
 * Context provided to the part flatMap function.
 */
export type PartFlatMapContext<
  UI_MESSAGE extends UIMessage,
  PART extends InferUIMessagePart<UI_MESSAGE> = InferUIMessagePart<UI_MESSAGE>,
> = {
  /** The index of the current part in the stream (0-based) */
  index: number;
  /** All parts seen so far (including the current one) */
  parts: PART[];
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
  input: PartFlatMapInput<UI_MESSAGE, PART>,
  context: PartFlatMapContext<UI_MESSAGE>,
) => PART | null;

/**
 * Predicate function to determine which parts should be buffered.
 * Receives a PartialPart built from the current chunk.
 * Returns true to buffer the part for transformation, false to pass through immediately.
 */
export type FlatMapUIMessageStreamPredicate<
  UI_MESSAGE extends UIMessage,
  // Part is needed for type narrowing in the predicate
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
  const [stream, predicate, flatMapFn] =
    args.length === 2
      ? [args[0], undefined, args[1]]
      : [args[0], args[1], args[2]];

  // Tee the stream: one for readUIMessageStream, one for chunk processing
  const [messageStreamSource, chunkStreamSource] = stream.tee();

  // Completed parts indexed by content part number (excluding step-start)
  const completedParts = new Map<
    number,
    { part: InferUIMessagePart<UI_MESSAGE>; result: PART | null }
  >();
  const allParts: InferUIMessagePart<UI_MESSAGE>[] = [];

  // Track completion state per message-part-index to detect state transitions
  const partCompletionState = new Map<number, boolean>();

  // Get the async iterator from readUIMessageStream
  const uiMessageIterator = readUIMessageStream<UI_MESSAGE>({
    stream: messageStreamSource,
  })[Symbol.asyncIterator]();

  // Wait for a content part (by index) to be completed
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

          // Apply predicate and flatMap
          const shouldProcess =
            !predicate ||
            predicate(typedPart as InferPartialUIMessagePart<UI_MESSAGE>);

          const result: PART | null = shouldProcess
            ? ((flatMapFn as FlatMapUIMessageStreamFn<UI_MESSAGE>)(
                { part: typedPart },
                {
                  index,
                  parts: allParts,
                },
              ) as PART | null)
            : (typedPart as PART);

          completedParts.set(contentPartIndex, { part: typedPart, result });
        }

        contentPartIndex++;
      }
    }

    return completedParts.get(contentIndex);
  }

  // Chunk stream processing state
  let bufferedStartStep: InferUIMessageChunk<UI_MESSAGE> | undefined;
  let stepStartEnqueued = false;
  let stepHasContent = false;
  let chunkPartIndex = 0;
  let bufferedChunks: InferUIMessageChunk<UI_MESSAGE>[] = [];
  let isBufferingCurrentPart = false;
  let isStreamingCurrentPart = false;
  const toolCallStates = new Map<string, ToolCallState>();

  function emitChunk(
    controller: TransformStreamDefaultController<
      InferUIMessageChunk<UI_MESSAGE>
    >,
    chunk: InferUIMessageChunk<UI_MESSAGE>,
  ) {
    if (bufferedStartStep && !stepHasContent) {
      stepHasContent = true;
      controller.enqueue(bufferedStartStep);
      stepStartEnqueued = true;
      bufferedStartStep = undefined;
    }
    controller.enqueue(chunk);
  }

  function emitChunks(
    controller: TransformStreamDefaultController<
      InferUIMessageChunk<UI_MESSAGE>
    >,
    chunks: InferUIMessageChunk<UI_MESSAGE>[],
  ) {
    for (const chunk of chunks) {
      emitChunk(controller, chunk);
    }
  }

  const transformStream = new TransformStream<
    InferUIMessageChunk<UI_MESSAGE>,
    InferUIMessageChunk<UI_MESSAGE>
  >({
    async transform(chunk, controller) {
      // Pass through meta chunks
      if (isMetaChunk(chunk)) {
        controller.enqueue(chunk);
        return;
      }

      // Buffer start-step
      if (isStepStartChunk(chunk)) {
        bufferedStartStep = chunk;
        stepHasContent = false;
        return;
      }

      // Handle finish-step
      if (isStepEndChunk(chunk)) {
        if (stepStartEnqueued) {
          controller.enqueue(chunk);
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
          // These are both start and end, so process immediately
          if (isPartEndChunk(chunk)) {
            const partIndex = chunkPartIndex++;
            const chunks = bufferedChunks;
            isBufferingCurrentPart = false;
            bufferedChunks = [];

            const completed = await waitForPart(partIndex);
            if (completed) {
              const { part, result } = completed;
              if (result === null) {
                // Filtered out - don't emit anything
              } else if (result === part) {
                emitChunks(controller, chunks);
              } else {
                emitChunks(
                  controller,
                  serializePartToChunks(
                    result,
                    chunks,
                  ) as InferUIMessageChunk<UI_MESSAGE>[],
                );
              }
            }
          }
        } else {
          // Stream this part through immediately (no flatMap)
          isBufferingCurrentPart = false;
          isStreamingCurrentPart = true;
          chunkPartIndex++; // Still count it for index tracking
          emitChunk(controller, chunk);

          // Handle single-chunk parts that are streamed through
          if (isPartEndChunk(chunk)) {
            isStreamingCurrentPart = false;
          }
        }
        return;
      }

      // Continue streaming non-matching part
      if (isStreamingCurrentPart) {
        emitChunk(controller, chunk);
        if (isPartEndChunk(chunk)) {
          isStreamingCurrentPart = false;
        }
        return;
      }

      // Continue buffering matching part
      if (isBufferingCurrentPart) {
        bufferedChunks.push(chunk);

        // End of part - wait for completion and emit
        if (isPartEndChunk(chunk)) {
          const partIndex = chunkPartIndex++;
          const chunks = bufferedChunks;
          isBufferingCurrentPart = false;
          bufferedChunks = [];

          const completed = await waitForPart(partIndex);
          if (completed) {
            const { part, result } = completed;
            if (result === null) {
              // Filtered out - don't emit anything
            } else if (result === part) {
              emitChunks(controller, chunks);
            } else {
              emitChunks(
                controller,
                serializePartToChunks(
                  result,
                  chunks,
                ) as InferUIMessageChunk<UI_MESSAGE>[],
              );
            }
          }
        }
      }
    },

    async flush(controller) {
      // Drain the message iterator
      while (true) {
        const { done } = await uiMessageIterator.next();
        if (done) break;
      }

      // Handle any remaining buffered chunks
      if (isBufferingCurrentPart && bufferedChunks.length > 0) {
        const completed = completedParts.get(chunkPartIndex);
        if (completed?.result !== null && completed) {
          const { part, result } = completed;
          if (result === part) {
            emitChunks(controller, bufferedChunks);
          } else {
            emitChunks(
              controller,
              serializePartToChunks(
                result,
                bufferedChunks,
              ) as InferUIMessageChunk<UI_MESSAGE>[],
            );
          }
        }
      }

      // Cleanup
      completedParts.clear();
      allParts.length = 0;
      partCompletionState.clear();
      toolCallStates.clear();
    },
  });

  return createAsyncIterableStream(
    chunkStreamSource.pipeThrough(transformStream),
  );
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
