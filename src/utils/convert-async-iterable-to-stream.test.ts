import { describe, expect, test } from 'vitest';
import { convertAsyncIterableToStream } from './convert-async-iterable-to-stream.js';
import { convertStreamToArray } from './convert-stream-to-array.js';

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
});
