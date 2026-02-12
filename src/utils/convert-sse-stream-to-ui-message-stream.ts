import { parseJsonEventStream, type UIMessageChunk, uiMessageChunkSchema } from "ai";

/**
 * Converts an SSE stream to a UI message stream.
 */
export function convertSSEToUIMessageStream(
  stream: ReadableStream<string>,
): ReadableStream<UIMessageChunk> {
  return parseJsonEventStream({
    stream: stream.pipeThrough(new TextEncoderStream()),
    schema: uiMessageChunkSchema,
  }).pipeThrough(
    new TransformStream({
      transform(result, controller) {
        if (result.success) {
          controller.enqueue(result.value);
        }
      },
    }),
  );
}
