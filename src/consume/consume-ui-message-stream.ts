import type { InferUIMessageChunk, UIMessage } from "ai";
import { readUIMessageStream } from "ai";

/**
 * Consumes a UIMessageStream by fully reading it and returning the final UI message.
 *
 * This function uses `readUIMessageStream` to process all chunks from the stream
 * and returns the last assembled message, which contains the complete content
 * with all parts fully resolved.
 *
 * If the source stream errors, the returned promise rejects with that same error,
 * also when some chunks were already read. An `error` chunk in the stream does not
 * cause a rejection: it is processed like any other chunk.
 *
 * @example
 * ```typescript
 * const message = await consumeUIMessageStream(stream);
 * console.log(message.parts); // All parts fully assembled
 * ```
 *
 * @example
 * ```typescript
 * const stream = result.toUIMessageStream();
 * const filteredStream = pipe(stream).filter(includeParts(['text'])).toStream();
 * const message = await consumeUIMessageStream(filteredStream);
 * ```
 */
export async function consumeUIMessageStream<UI_MESSAGE extends UIMessage>(
  stream: ReadableStream<InferUIMessageChunk<UI_MESSAGE>>,
): Promise<UI_MESSAGE> {
  let lastMessage: UI_MESSAGE | undefined;
  let sourceError: { error: unknown } | undefined;

  /**
   * The reader reports source stream errors and `error` chunks through the same callback
   * and then closes its output without an error. Wrap the source to capture its own error,
   * so that it can be told apart from an `error` chunk.
   */
  const reader = stream.getReader();
  const sourceStream = new ReadableStream<InferUIMessageChunk<UI_MESSAGE>>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
        } else {
          controller.enqueue(value);
        }
      } catch (error) {
        sourceError ??= { error };
        controller.error(error);
      }
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });

  for await (const message of readUIMessageStream<UI_MESSAGE>({ stream: sourceStream })) {
    lastMessage = message;
  }

  if (sourceError) {
    throw sourceError.error;
  }

  if (!lastMessage) {
    throw new Error("Unexpected: stream ended without producing any messages");
  }

  return lastMessage;
}
