import type { InferUIMessageChunk, UIMessage } from 'ai';
import { readUIMessageStream } from 'ai';

/**
 * Consumes a UIMessageStream by fully reading it and returning the final UI message.
 *
 * This function uses `readUIMessageStream` to process all chunks from the stream
 * and returns the last assembled message, which contains the complete content
 * with all parts fully resolved.
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
 * const filteredStream = filterUIMessageStream(stream, includeParts(['text']));
 * const message = await consumeUIMessageStream(filteredStream);
 * ```
 */
export async function consumeUIMessageStream<UI_MESSAGE extends UIMessage>(
  stream: ReadableStream<InferUIMessageChunk<UI_MESSAGE>>,
): Promise<UI_MESSAGE> {
  let lastMessage: UI_MESSAGE | undefined;

  for await (const message of readUIMessageStream<UI_MESSAGE>({ stream })) {
    lastMessage = message;
  }

  if (!lastMessage) {
    throw new Error('Unexpected: stream ended without producing any messages');
  }

  return lastMessage;
}
