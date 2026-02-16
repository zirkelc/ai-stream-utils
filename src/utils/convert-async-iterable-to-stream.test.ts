import { describe, expect, test } from "vitest";
import { convertAsyncIterableToStream } from "./convert-async-iterable-to-stream.js";
import { convertStreamToArray } from "./convert-stream-to-array.js";

describe(`convertAsyncIterableToStream`, () => {
  test(`should convert async iterable to stream`, async () => {
    // Arrange
    async function* generator() {
      yield 1;
      yield 2;
      yield 3;
    }

    // Act
    const stream = convertAsyncIterableToStream(generator());
    const result = await convertStreamToArray(stream);

    // Assert
    expect(result).toEqual([1, 2, 3]);
  });

  test(`should handle empty async iterable`, async () => {
    // Arrange
    async function* generator() {
      /** empty */
    }

    // Act
    const stream = convertAsyncIterableToStream(generator());
    const result = await convertStreamToArray(stream);

    // Assert
    expect(result).toEqual([]);
  });

  test(`should return ReadableStream that can be read with getReader`, async () => {
    // Arrange
    async function* generator() {
      yield `a`;
      yield `b`;
    }

    // Act
    const stream = convertAsyncIterableToStream(generator());
    const reader = stream.getReader();
    const result: Array<string> = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      result.push(value);
    }
    reader.releaseLock();

    // Assert
    expect(result).toEqual([`a`, `b`]);
  });

  test(`should trigger finally block cleanup on cancellation`, async () => {
    // Arrange
    let cleanedUp = false;
    async function* generator() {
      try {
        yield 1;
        yield 2;
      } finally {
        cleanedUp = true;
      }
    }

    // Act
    const stream = convertAsyncIterableToStream(generator());
    const reader = stream.getReader();
    await reader.read();
    await reader.cancel();

    // Assert
    expect(cleanedUp).toBe(true);
  });

  test(`should not enqueue values after cancel`, async () => {
    // Arrange
    const yielded: Array<number> = [];
    async function* generator() {
      for (let i = 1; i <= 5; i++) {
        yielded.push(i);
        yield i;
      }
    }

    // Act
    const stream = convertAsyncIterableToStream(generator());
    const reader = stream.getReader();
    await reader.read();
    await reader.cancel();

    // Assert
    expect(yielded.length).toBe(1);
  });

  test(`should handle cancellation when iterator has no return method`, async () => {
    // Arrange
    const iterable: AsyncIterable<number> = {
      [Symbol.asyncIterator]() {
        let i = 0;
        return {
          async next() {
            i++;
            if (i > 3) return { done: true, value: undefined };
            return { done: false, value: i };
          },
          /** no return method */
        };
      },
    };

    // Act
    const stream = convertAsyncIterableToStream(iterable);
    const reader = stream.getReader();
    await reader.read();
    const result = reader.cancel();

    // Assert
    await expect(result).resolves.toBeUndefined();
  });

  test(`should suppress errors from iterator.return()`, async () => {
    // Arrange
    const iterable: AsyncIterable<number> = {
      [Symbol.asyncIterator]() {
        return {
          async next() {
            return { done: false, value: 1 };
          },
          async return() {
            throw new Error(`cleanup error`);
          },
        };
      },
    };

    // Act
    const stream = convertAsyncIterableToStream(iterable);
    const reader = stream.getReader();
    await reader.read();
    const result = reader.cancel();

    // Assert
    await expect(result).resolves.toBeUndefined();
  });
});
