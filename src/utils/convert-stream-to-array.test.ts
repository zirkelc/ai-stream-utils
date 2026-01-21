import { describe, expect, test } from 'vitest';
import { convertArrayToStream } from './convert-array-to-stream.js';
import { convertStreamToArray } from './convert-stream-to-array.js';

describe(`convertStreamToArray`, () => {
  test(`should convert stream to array`, async () => {
    // Arrange
    const stream = convertArrayToStream([1, 2, 3]);

    // Act
    const result = await convertStreamToArray(stream);

    // Assert
    expect(result).toEqual([1, 2, 3]);
  });

  test(`should handle empty stream`, async () => {
    // Arrange
    const stream = convertArrayToStream<number>([]);

    // Act
    const result = await convertStreamToArray(stream);

    // Assert
    expect(result).toEqual([]);
  });

  test(`should handle stream with objects`, async () => {
    // Arrange
    const stream = convertArrayToStream([{ a: 1 }, { b: 2 }]);

    // Act
    const result = await convertStreamToArray(stream);

    // Assert
    expect(result).toEqual([{ a: 1 }, { b: 2 }]);
  });
});
