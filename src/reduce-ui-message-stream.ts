import { convertAsyncIteratorToReadableStream } from '@ai-sdk/provider-utils';
import type { AsyncIterableStream, InferUIMessageChunk, UIMessage } from 'ai';
import type { PartInput } from './pipe-ui-message-stream.js';
import type { InferUIMessagePart } from './types.js';
import { createAsyncIterableStream } from './utils/create-async-iterable-stream.js';
import { fastReadUIMessageStream } from './utils/fast-read-ui-message-stream.js';
import {
  isMetaChunk,
  isStepEndChunk,
  isStepStartChunk,
} from './utils/stream-utils.js';

/**
 * Reduces a stream of chunks to complete parts.
 *
 * Buffers chunks until a part completes (detected when part count increases),
 * then emits the complete part with all its chunks as a PartInput object.
 *
 * Meta chunks and step chunks are skipped - this transformer only outputs
 * complete parts.
 *
 * @example
 * ```typescript
 * // Convert chunk stream to part stream
 * const partStream = reduceUIMessageStream(chunkStream);
 *
 * for await (const { part, chunks } of partStream) {
 *   console.log('Complete part:', part);
 * }
 * ```
 */
export function reduceUIMessageStream<UI_MESSAGE extends UIMessage>(
  stream: ReadableStream<InferUIMessageChunk<UI_MESSAGE>>,
): AsyncIterableStream<PartInput<InferUIMessagePart<UI_MESSAGE>>> {
  async function* processChunks(): AsyncGenerator<
    PartInput<InferUIMessagePart<UI_MESSAGE>>
  > {
    let buffer: Array<InferUIMessageChunk<UI_MESSAGE>> = [];
    let lastPartCount = 0;
    let lastMessage: UI_MESSAGE | undefined;

    for await (const { chunk, message } of fastReadUIMessageStream<UI_MESSAGE>(
      stream,
    )) {
      /** Skip meta chunks and step boundaries */
      if (
        isMetaChunk(chunk) ||
        isStepStartChunk(chunk) ||
        isStepEndChunk(chunk)
      ) {
        continue;
      }

      if (!message) {
        throw new Error(
          `Unexpected: received content chunk but message is undefined`,
        );
      }

      lastMessage = message;

      /** New part started - emit previous part (same pattern as flatMapUIMessageStream) */
      if (message.parts.length > lastPartCount) {
        if (lastPartCount > 0) {
          const part = message.parts[lastPartCount - 1]!;
          yield { part, chunks: buffer };
          buffer = [];
        }
        lastPartCount = message.parts.length;
      }

      buffer.push(chunk);
    }

    /** Emit final part */
    if (buffer.length > 0 && lastMessage && lastPartCount > 0) {
      const part = lastMessage.parts[lastPartCount - 1]!;
      yield { part, chunks: buffer };
    }
  }

  const outputStream = convertAsyncIteratorToReadableStream(processChunks());
  return createAsyncIterableStream(outputStream);
}
