import {
  type InferUIMessageChunk,
  parseJsonEventStream,
  type UIMessage,
  uiMessageChunkSchema,
} from "ai";

/**
 * Converts an SSE stream to a UI message stream.
 */
export function convertSSEToUIMessageStream<UI_MESSAGE extends UIMessage = UIMessage>(
  stream: ReadableStream<string>,
): ReadableStream<InferUIMessageChunk<UI_MESSAGE>> {
  return parseJsonEventStream({
    stream: stream.pipeThrough(new TextEncoderStream()),
    schema: uiMessageChunkSchema,
  }).pipeThrough(
    new TransformStream({
      transform(result, controller) {
        if (result.success) {
          controller.enqueue(result.value as InferUIMessageChunk<UI_MESSAGE>);
        }
      },
    }),
  );
}
