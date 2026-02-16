/**
 * Converts an AsyncIterable to a ReadableStream.
 * Copied from https://github.com/vercel/ai/blob/main/packages/provider-utils/src/convert-async-iterator-to-readable-stream.ts
 */
export function convertAsyncIterableToStream<T>(iterable: AsyncIterable<T>): ReadableStream<T> {
  const iterator = iterable[Symbol.asyncIterator]();
  let cancelled = false;

  return new ReadableStream<T>({
    async pull(controller) {
      if (cancelled) return;

      try {
        const { value, done } = await iterator.next();
        if (done) {
          controller.close();
        } else {
          controller.enqueue(value);
        }
      } catch (error) {
        controller.error(error);
      }
    },
    async cancel(reason) {
      cancelled = true;
      try {
        await iterator.return?.(reason);
      } catch {
        /** ignore errors during cancellation */
      }
    },
  });
}
