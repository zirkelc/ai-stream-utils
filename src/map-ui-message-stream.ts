import { convertAsyncIteratorToReadableStream } from '@ai-sdk/provider-utils';
import type { AsyncIterableStream, InferUIMessageChunk, UIMessage } from 'ai';
import type { InferUIMessagePart } from './types.js';
import { createAsyncIterableStream } from './utils/create-async-iterable-stream.js';
import { fastReadUIMessageStream } from './utils/fast-read-ui-message-stream.js';
import {
  asArray,
  isMetaChunk,
  isStepEndChunk,
  isStepStartChunk,
} from './utils/internal/stream-utils.js';

/**
 * Input object provided to the chunk map function.
 */
export type MapInput<UI_MESSAGE extends UIMessage> = {
  /** The current chunk */
  chunk: InferUIMessageChunk<UI_MESSAGE>;
  /**
   * The assembled part this chunk belongs to (from readUIMessageStream).
   * Use `part.type` to determine the part type.
   */
  part: InferUIMessagePart<UI_MESSAGE>;
};

/**
 * Map function for chunk-level transformation.
 * Return:
 * - A single chunk (possibly transformed) to include it
 * - An array of chunks to emit multiple chunks
 * - An empty array or null to filter out the chunk
 */
export type MapUIMessageStreamFn<UI_MESSAGE extends UIMessage> = (
  input: MapInput<UI_MESSAGE>,
) => InferUIMessageChunk<UI_MESSAGE> | InferUIMessageChunk<UI_MESSAGE>[] | null;

/**
 * Maps/filters a UIMessageStream at the chunk level using readUIMessageStream.
 *
 * This function processes each chunk as it arrives and allows you to:
 * - Transform chunks by returning a modified chunk
 * - Filter out chunks by returning null or an empty array
 * - Emit multiple chunks by returning an array
 *
 * Meta chunks (start, finish, abort, message-metadata, error) always pass through.
 * Step boundaries (start-step, finish-step) are handled automatically:
 * - start-step is buffered and only emitted if subsequent content is included
 * - finish-step is only emitted if the corresponding start-step was emitted
 *
 * @example
 * ```typescript
 * // Filter out reasoning chunks using part.type
 * const stream = mapUIMessageStream(
 *   inputStream,
 *   ({ chunk, part }) => part.type === 'reasoning' ? null : chunk
 * );
 *
 * // Transform text chunks
 * const stream = mapUIMessageStream(
 *   inputStream,
 *   ({ chunk, part }) => {
 *     if (chunk.type === 'text-delta') {
 *       return { ...chunk, delta: chunk.delta.toUpperCase() };
 *     }
 *     return chunk;
 *   }
 * );
 *
 * // Buffer text deltas and split into word-by-word chunks (smooth streaming)
 * let buffer = '';
 * let textStartChunk = null;
 * const stream = mapUIMessageStream(
 *   inputStream,
 *   ({ chunk }) => {
 *     if (chunk.type === 'text-start') {
 *       textStartChunk = chunk;
 *       return []; // Buffer, don't emit yet
 *     }
 *     if (chunk.type === 'text-delta') {
 *       buffer += chunk.delta;
 *       return []; // Buffer, don't emit yet
 *     }
 *     if (chunk.type === 'text-end') {
 *       // Emit buffered content as word chunks
 *       const words = buffer.split(' ');
 *       const wordChunks = words.map((word, i) => ({
 *         type: 'text-delta' as const,
 *         id: chunk.id,
 *         delta: i === 0 ? word : ` ${word}`,
 *       }));
 *       buffer = '';
 *       const result = [...wordChunks, chunk];
 *       if (textStartChunk) {
 *         result.unshift(textStartChunk);
 *         textStartChunk = null;
 *       }
 *       return result;
 *     }
 *     return chunk;
 *   }
 * );
 * ```
 */
export function mapUIMessageStream<UI_MESSAGE extends UIMessage>(
  stream: ReadableStream<InferUIMessageChunk<UI_MESSAGE>>,
  mapFn: MapUIMessageStreamFn<UI_MESSAGE>,
): AsyncIterableStream<InferUIMessageChunk<UI_MESSAGE>> {
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
   * Main processing generator.
   */
  async function* processChunks(): AsyncGenerator<
    InferUIMessageChunk<UI_MESSAGE>
  > {
    for await (const { chunk, message } of fastReadUIMessageStream<UI_MESSAGE>(
      stream,
    )) {
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

      // Step is ending. Only emit finish-step if we emitted the corresponding start-step.
      if (isStepEndChunk(chunk)) {
        if (stepStartEmitted) {
          yield chunk;
          stepStartEmitted = false;
        }
        bufferedStartStep = undefined;
        continue;
      }

      // Content chunks should always have a message from readUIMessageStream.
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

      // Apply the user's mapFn with the chunk and current part.
      const result = mapFn({
        chunk,
        part: currentPart,
      });

      const chunks = asArray(result);

      // If mapFn returned chunks, emit them (with step boundary handling).
      if (chunks.length > 0) {
        yield* emitChunks(chunks);
      }
    }
  }

  const outputStream = convertAsyncIteratorToReadableStream(processChunks());
  return createAsyncIterableStream(outputStream);
}
