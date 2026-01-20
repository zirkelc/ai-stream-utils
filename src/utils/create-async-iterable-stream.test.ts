import { describe, expect, test } from 'vitest';
import { convertArrayToStream } from './convert-array-to-stream.js';
import { createAsyncIterableStream } from './create-async-iterable-stream.js';

describe(`createAsyncIterableStream`, () => {
  test(`should convert ReadableStream to AsyncIterableStream`, async () => {
    // Arrange
    const stream = convertArrayToStream([1, 2, 3]);

    // Act
    const asyncIterableStream = createAsyncIterableStream(stream);
    const result: Array<number> = [];
    for await (const item of asyncIterableStream) {
      result.push(item);
    }

    // Assert
    expect(result).toEqual([1, 2, 3]);
  });

  test(`should handle empty stream`, async () => {
    // Arrange
    const stream = convertArrayToStream<number>([]);

    // Act
    const asyncIterableStream = createAsyncIterableStream(stream);
    const result: Array<number> = [];
    for await (const item of asyncIterableStream) {
      result.push(item);
    }

    // Assert
    expect(result).toEqual([]);
  });

  test(`should handle early exit with break`, async () => {
    // Arrange
    const stream = convertArrayToStream([1, 2, 3, 4, 5]);

    // Act
    const asyncIterableStream = createAsyncIterableStream(stream);
    const result: Array<number> = [];
    for await (const item of asyncIterableStream) {
      result.push(item);
      if (item === 2) break;
    }

    // Assert
    expect(result).toEqual([1, 2]);
  });

  test(`should be usable as ReadableStream`, async () => {
    // Arrange
    const stream = convertArrayToStream([`a`, `b`, `c`]);

    // Act
    const asyncIterableStream = createAsyncIterableStream(stream);
    const reader = asyncIterableStream.getReader();
    const result: Array<string> = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      result.push(value);
    }
    reader.releaseLock();

    // Assert
    expect(result).toEqual([`a`, `b`, `c`]);
  });

  test(`should handle objects`, async () => {
    // Arrange
    const stream = convertArrayToStream([{ a: 1 }, { b: 2 }]);

    // Act
    const asyncIterableStream = createAsyncIterableStream(stream);
    const result: Array<{ a?: number; b?: number }> = [];
    for await (const item of asyncIterableStream) {
      result.push(item);
    }

    // Assert
    expect(result).toEqual([{ a: 1 }, { b: 2 }]);
  });
});
