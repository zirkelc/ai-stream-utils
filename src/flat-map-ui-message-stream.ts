import { convertAsyncIteratorToReadableStream } from '@ai-sdk/provider-utils';
import type {
  AsyncIterableStream,
  InferUIMessageChunk,
  UIMessage,
  UIMessageChunk,
} from 'ai';
import type { InferUIMessagePart, InferUIMessagePartType } from './types.js';
import { createAsyncIterableStream } from './utils/create-async-iterable-stream.js';
import { fastReadUIMessageStream } from './utils/fast-read-ui-message-stream.js';
import { serializePartToChunks } from './utils/serialize-part-to-chunks.js';
import {
  asArray,
  isMetaChunk,
  isStepEndChunk,
  isStepStartChunk,
} from './utils/stream-utils.js';

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
 * - A single part (possibly transformed) to include it
 * - An array of parts to emit multiple parts
 * - An empty array or null to filter out the part
 */
export type FlatMapUIMessageStreamFn<
  UI_MESSAGE extends UIMessage,
  PART extends InferUIMessagePart<UI_MESSAGE> = InferUIMessagePart<UI_MESSAGE>,
> = (
  input: FlatMapInput<UI_MESSAGE, PART>,
  context: FlatMapContext<UI_MESSAGE>,
) => InferUIMessagePart<UI_MESSAGE> | InferUIMessagePart<UI_MESSAGE>[] | null;

/**
 * Predicate function to determine which parts should be buffered.
 * Receives the part from readUIMessageStream (may still be streaming).
 * Returns true to buffer the part for transformation, false to pass through immediately.
 */
export type FlatMapUIMessageStreamPredicate<
  UI_MESSAGE extends UIMessage,
  PART extends InferUIMessagePart<UI_MESSAGE> = InferUIMessagePart<UI_MESSAGE>,
> = (part: InferUIMessagePart<UI_MESSAGE>) => boolean;

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
  // Cast through unknown since part.type may not exactly overlap with PART_TYPE
  return (part: InferUIMessagePart<UI_MESSAGE>): boolean =>
    partTypes.includes(part.type as unknown as PART_TYPE);
}

/**
 * FlatMaps a UIMessageStream at the part level using readUIMessageStream.
 *
 * This function buffers all chunks for a part until it's complete, then allows
 * you to transform the complete part. This is useful when you need access to
 * the full part content before deciding how to transform it.
 *
 * When a predicate is provided (e.g., `partTypeIs('text')`), only matching parts
 * are buffered for transformation. Non-matching parts stream through immediately
 * without buffering, preserving real-time streaming behavior.
 *
 * Meta chunks (start, finish, abort, message-metadata, error) always pass through.
 * Step boundaries (start-step, finish-step) are handled automatically:
 * - start-step is buffered and only emitted if subsequent content is included
 * - finish-step is only emitted if the corresponding start-step was emitted
 *
 * @example
 * ```typescript
 * // Filter out reasoning parts
 * const stream = flatMapUIMessageStream(
 *   inputStream,
 *   ({ part }) => part.type === 'reasoning' ? null : part
 * );
 *
 * // Transform text content
 * const stream = flatMapUIMessageStream(
 *   inputStream,
 *   ({ part }) => {
 *     if (part.type === 'text') {
 *       return { ...part, text: part.text.toUpperCase() };
 *     }
 *     return part;
 *   }
 * );
 *
 * // Buffer only specific parts, pass through others immediately
 * const stream = flatMapUIMessageStream(
 *   inputStream,
 *   partTypeIs('text'),
 *   ({ part }) => ({ ...part, text: part.text.toUpperCase() })
 * );
 *
 * // Transform one part into multiple parts
 * const stream = flatMapUIMessageStream(
 *   inputStream,
 *   ({ part }) => {
 *     if (part.type === 'text') {
 *       return [
 *         { type: 'text', text: 'Prefix: ' },
 *         part,
 *       ];
 *     }
 *     return part;
 *   }
 * );
 *
 * // Access previous parts and index
 * const stream = flatMapUIMessageStream(
 *   inputStream,
 *   ({ part }, { index, parts }) => {
 *     console.log(`Processing part ${index}, previous parts: ${parts.length - 1}`);
 *     return part;
 *   }
 * );
 * ```
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

  /**
   * Mode for processing the current part.
   * - 'buffering': predicate matched, collecting chunks to transform later
   * - 'streaming': predicate didn't match, passing chunks through immediately
   */
  type PartMode = 'buffering' | 'streaming';

  /** Tracks the number of parts seen so far. Used to detect when a new part starts. */
  let lastPartCount = 0;

  /** Current processing mode for the active part. Undefined when no part is being processed. */
  let currentMode: PartMode | undefined;

  /** Chunks collected while buffering a part. Passed to serializePartToChunks for re-serialization. */
  let bufferedChunks: InferUIMessageChunk<UI_MESSAGE>[] = [];

  /** The part currently being buffered. Needed to flush on step end when message is unavailable. */
  let lastBufferedPart: InferUIMessagePart<UI_MESSAGE> | undefined;

  /** All completed parts. Passed to flatMapFn as context.parts. */
  const allParts: InferUIMessagePart<UI_MESSAGE>[] = [];

  /** Buffered start-step chunk. Only emitted if content follows (prevents orphan step boundaries). */
  let bufferedStartStep: InferUIMessageChunk<UI_MESSAGE> | undefined;

  /** Tracks if start-step was emitted, so we know to emit the matching finish-step. */
  let stepStartEmitted = false;

  /**
   * Generator that yields chunks with step boundary handling.
   */
  async function* emitChunks(
    chunks: InferUIMessageChunk<UI_MESSAGE>[],
  ): AsyncGenerator<InferUIMessageChunk<UI_MESSAGE>> {
    // Emit the buffered start-step before any content.
    // This ensures start-step is only emitted when content actually follows.
    if (bufferedStartStep) {
      yield bufferedStartStep;
      stepStartEmitted = true;
      bufferedStartStep = undefined;
    }
    for (const chunk of chunks) {
      yield chunk;
    }
  }

  /**
   * Flush buffered part: apply flatMapFn and yield chunks.
   * Uses serializePartContentChunks (without step boundaries) and delegates
   * step boundary handling to emitChunks.
   */
  async function* flushBufferedPart(
    completedPart: InferUIMessagePart<UI_MESSAGE>,
  ): AsyncGenerator<InferUIMessageChunk<UI_MESSAGE>> {
    currentMode = undefined;
    allParts.push(completedPart);

    const result = flatMapFn(
      { part: completedPart as PART },
      { index: allParts.length - 1, parts: allParts },
    );

    // Normalize to array and emit chunks for each part
    const parts = asArray(result);
    for (const part of parts) {
      const chunksToEmit = serializePartToChunks(part, bufferedChunks);
      yield* emitChunks(chunksToEmit);
    }

    bufferedChunks = [];
    lastBufferedPart = undefined;
  }

  /**
   * Main processing generator.
   */
  async function* processChunks(): AsyncGenerator<
    InferUIMessageChunk<UI_MESSAGE>
  > {
    for await (const {
      chunk: rawChunk,
      message,
    } of fastReadUIMessageStream<UI_MESSAGE>(inputStream)) {
      const chunk = rawChunk as InferUIMessageChunk<UI_MESSAGE>;

      // Meta chunks (start, finish, abort, error, message-metadata) always pass through unchanged.
      if (isMetaChunk(chunk)) {
        yield chunk;
        continue;
      }

      // Buffer start-step instead of emitting immediately.
      // It will only be emitted when content follows (via emitChunks).
      if (isStepStartChunk(chunk)) {
        bufferedStartStep = chunk;
        continue;
      }

      // Step is ending. Flush any pending buffered part and emit finish-step if start-step was emitted.
      if (isStepEndChunk(chunk)) {
        // Part was still being buffered (e.g., tool without execute function). Flush it now.
        if (currentMode === `buffering` && lastBufferedPart) {
          yield* flushBufferedPart(lastBufferedPart);
        }

        // Only emit finish-step if we emitted the corresponding start-step.
        if (stepStartEmitted) {
          yield chunk;
          stepStartEmitted = false;
        }
        bufferedStartStep = undefined;
        currentMode = undefined;
        continue;
      }

      // Content chunks should always have a message from fastReadUIMessageStream.
      // If not, the stream reader behavior has changed unexpectedly.
      if (!message) {
        throw new Error(
          `Unexpected: received content chunk but message is undefined`,
        );
      }

      // Content chunks should always have a corresponding part in the message.
      // If not, the AI SDK behavior has changed unexpectedly.
      const currentPart = message.parts[message.parts.length - 1];
      if (!currentPart) {
        throw new Error(
          `Unexpected: received content chunk but message has no parts`,
        );
      }

      // New part started (part count increased). Previous part is now complete.
      if (message.parts.length > lastPartCount) {
        // Previous part was buffered. Flush it before starting the new one.
        if (currentMode === `buffering` && lastBufferedPart) {
          yield* flushBufferedPart(lastBufferedPart);
        }
        // Previous part was streamed. Add it to allParts for context tracking.
        if (currentMode === `streaming` && lastPartCount > 0) {
          const previousPart = message.parts[lastPartCount - 1];
          if (previousPart) {
            allParts.push(previousPart);
          }
        }

        const shouldBuffer = !predicate || predicate(currentPart);

        // Predicate matched (or no predicate). Buffer this part for transformation.
        if (shouldBuffer) {
          currentMode = `buffering`;
          bufferedChunks = [chunk];
          lastBufferedPart = currentPart;
          // Predicate didn't match. Stream this part through immediately.
        } else {
          currentMode = `streaming`;
          yield* emitChunks([chunk]);
        }

        lastPartCount = message.parts.length;
        // Same part, still buffering. Add chunk to buffer and update lastBufferedPart.
      } else if (currentMode === `buffering`) {
        bufferedChunks.push(chunk);
        lastBufferedPart = currentPart;
        // Same part, still streaming. Pass chunk through immediately.
      } else if (currentMode === `streaming`) {
        yield* emitChunks([chunk]);
      }
    }
  }

  const outputStream = convertAsyncIteratorToReadableStream(processChunks());
  return createAsyncIterableStream(outputStream);
}
