import { JsonToSseTransformStream, type UIMessageChunk } from "ai";

/**
 * Converts a UI message stream to an SSE stream.
 */
export function convertUIMessageToSSEStream(
  stream: ReadableStream<UIMessageChunk>,
): ReadableStream<string> {
  return stream.pipeThrough(new JsonToSseTransformStream());
}
