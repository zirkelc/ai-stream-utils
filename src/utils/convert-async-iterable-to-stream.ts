/**
 * Converts an AsyncIterable to a ReadableStream.
 */
export function convertAsyncIterableToStream<T>(
  iterable: AsyncIterable<T>,
): ReadableStream<T> {
  return new ReadableStream<T>({
    async start(controller) {
      for await (const item of iterable) {
        controller.enqueue(item);
      }
      controller.close();
    },
  });
}
