import type { AsyncIterableStream } from "ai";

/**
 * Converts a ReadableStream to an AsyncIterableStream.
 * Copied from https://github.com/vercel/ai/blob/main/packages/ai/src/util/async-iterable-stream.ts
 */
export function createAsyncIterableStream<T>(source: ReadableStream<T>): AsyncIterableStream<T> {
  /** Pipe through a TransformStream to ensure a fresh, unlocked stream. */
  const stream = source.pipeThrough(new TransformStream<T, T>());

  /** Implements the async iterator protocol for the stream. */
  return Object.assign(stream, {
    [Symbol.asyncIterator](): AsyncIterator<T> {
      const reader = stream.getReader();

      let finished = false;

      /** Cleans up the reader by cancelling and releasing the lock. */
      async function cleanup(cancelStream: boolean) {
        finished = true;
        try {
          if (cancelStream) {
            await reader.cancel?.();
          }
        } finally {
          try {
            reader.releaseLock();
          } catch {}
        }
      }

      return {
        /** Reads the next chunk from the stream. */
        async next(): Promise<IteratorResult<T>> {
          if (finished) {
            return { done: true, value: undefined };
          }

          const { done, value } = await reader.read();

          if (done) {
            await cleanup(true);
            return { done: true, value: undefined };
          }

          return { done: false, value };
        },

        /** Called on early exit (e.g., break from for-await). */
        async return(): Promise<IteratorResult<T>> {
          await cleanup(true);
          return { done: true, value: undefined };
        },

        /** Called on early exit with error. */
        async throw(err: unknown): Promise<IteratorResult<T>> {
          await cleanup(true);
          throw err;
        },
      };
    },
  }) as AsyncIterableStream<T>;
}
