import { describe, expect, test } from "vitest";
import { convertArrayToStream } from "./convert-array-to-stream.js";
import { convertStreamToArray } from "./convert-stream-to-array.js";

describe(`convertArrayToStream`, () => {
  test(`should convert array to stream`, async () => {
    // Arrange
    const array = [1, 2, 3];

    // Act
    const stream = convertArrayToStream(array);
    const result = await convertStreamToArray(stream);

    // Assert
    expect(result).toEqual([1, 2, 3]);
  });

  test(`should handle empty array`, async () => {
    // Arrange
    const array: Array<number> = [];

    // Act
    const stream = convertArrayToStream(array);
    const result = await convertStreamToArray(stream);

    // Assert
    expect(result).toEqual([]);
  });

  test(`should handle array with objects`, async () => {
    // Arrange
    const array = [{ a: 1 }, { b: 2 }];

    // Act
    const stream = convertArrayToStream(array);
    const result = await convertStreamToArray(stream);

    // Assert
    expect(result).toEqual([{ a: 1 }, { b: 2 }]);
  });
});
