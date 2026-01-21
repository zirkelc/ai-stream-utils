/**
 * Converts an array to a ReadableStream.
 */
export function convertArrayToStream<T>(array: Array<T>): ReadableStream<T> {
  return new ReadableStream<T>({
    start(controller) {
      for (const item of array) {
        controller.enqueue(item);
      }
      controller.close();
    },
  });
}
