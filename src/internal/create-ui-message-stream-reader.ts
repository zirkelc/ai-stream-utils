import type { InferUIMessageChunk, UIMessage } from "ai";
import { readUIMessageStream } from "ai";
import type { InferUIMessagePart } from "../types.js";
import { getPartTypeFromChunk, type ToolCallIdMap } from "./get-part-type-from-chunk.js";
import { isMessageDataChunk, isMetaChunk, isStepEndChunk, isStepStartChunk } from "./utils.js";

/**
 * Value yielded by the UIMessageStreamReader async generator.
 */
export type UIMessageStreamReaderValue<UI_MESSAGE extends UIMessage> = {
  /** The current chunk from the input stream */
  chunk: InferUIMessageChunk<UI_MESSAGE>;
  /**
   * The assembled message with updated parts.
   * Undefined for meta chunks (start, finish, error, abort, message-metadata),
   * step chunks (start-step, finish-step), and data chunks (data-*) since they don't produce messages.
   */
  message: UI_MESSAGE | undefined;
  /**
   * Part info for the current chunk.
   * For content chunks: the actual part from the message, or a partial part with type resolved from chunk.
   * For data chunks: the chunk itself as a complete part `{ type: 'data-*', data: {...} }`.
   * Undefined for meta and step chunks.
   */
  part: InferUIMessagePart<UI_MESSAGE> | undefined;
};

/**
 * Creates an async generator that wraps a UIMessageStream with readUIMessageStream.
 *
 * This helper encapsulates the common pattern of:
 * 1. Reading chunks from an input stream
 * 2. Feeding them to readUIMessageStream for part assembly
 * 3. Yielding both the chunk and the assembled message
 *
 * @example
 * ```typescript
 * for await (const { chunk, message } of createUIMessageStreamReader<UIMessage>(inputStream)) {
 *   if (message) {
 *     const currentPart = message.parts[message.parts.length - 1];
 *     // ... process part
 *   }
 * }
 * ```
 */
export async function* createUIMessageStreamReader<UI_MESSAGE extends UIMessage>(
  inputStream: ReadableStream<InferUIMessageChunk<UI_MESSAGE>>,
): AsyncGenerator<UIMessageStreamReaderValue<UI_MESSAGE>> {
  // Reader for the input stream - used to read chunks one at a time
  const inputReader = inputStream.getReader();

  // Internal stream that we control - chunks are enqueued here and
  // readUIMessageStream consumes them to assemble parts into messages
  let controller!: ReadableStreamDefaultController<InferUIMessageChunk<UI_MESSAGE>>;
  const internalStream = new ReadableStream<InferUIMessageChunk<UI_MESSAGE>>({
    start(c) {
      controller = c;
    },
  });

  // readUIMessageStream returns an async iterable of assembled messages.
  // Each time we enqueue a content chunk and call iterator.next(),
  // we get back the updated message with the current part state.
  const uiMessages = readUIMessageStream<UI_MESSAGE>({
    stream: internalStream,
  });
  const iterator = uiMessages[Symbol.asyncIterator]();

  // Track tool call state for resolving part types when message is undefined
  const toolCallIdMap: ToolCallIdMap = new Map();

  try {
    while (true) {
      const { done, value: chunk } = await inputReader.read();
      if (done) {
        controller.close();
        break;
      }

      // Meta chunks (start, finish, error, etc.) and step chunks (start-step, finish-step)
      // don't emit messages and have no associated part.
      // We still enqueue them so readUIMessageStream can track state internally.
      if (isMetaChunk(chunk) || isStepStartChunk(chunk) || isStepEndChunk(chunk)) {
        controller.enqueue(chunk);
        yield { chunk, message: undefined, part: undefined };
        continue;
      }

      // Data chunks (data-*) don't emit messages in readUIMessageStream.
      // We DON'T enqueue them to avoid desync between chunks and iterator state.
      // Data chunk IS the complete part: { type: 'data-*', data: {...} }
      if (isMessageDataChunk(chunk)) {
        const part = chunk as unknown as InferUIMessagePart<UI_MESSAGE>;
        yield { chunk, message: undefined, part };
        continue;
      }

      // For content chunks, enqueue and get the updated message with assembled parts
      controller.enqueue(chunk);
      const result = await iterator.next();
      const message = result.done ? undefined : result.value;

      // Get the part from the message, or build a partial part from the chunk
      const messagePart = message?.parts[message.parts.length - 1];
      // Note: expectedPartType is never undefined here because meta/step chunks are filtered above
      const expectedPartType = getPartTypeFromChunk<UI_MESSAGE>(chunk, toolCallIdMap)!;

      // Use message part if it matches the expected type, otherwise use fallback.
      // This handles timing issues where readUIMessageStream may yield the message
      // before the new part is added (e.g., for *-start chunks).
      const part: InferUIMessagePart<UI_MESSAGE> =
        messagePart?.type === expectedPartType
          ? messagePart
          : ({
              type: expectedPartType,
            } as InferUIMessagePart<UI_MESSAGE>);

      yield { chunk, message, part };
    }
  } finally {
    // Drain any remaining messages from the iterator
    while (true) {
      const { done } = await iterator.next();
      if (done) break;
    }
    // Release the reader lock on the input stream
    inputReader.releaseLock();
  }
}
