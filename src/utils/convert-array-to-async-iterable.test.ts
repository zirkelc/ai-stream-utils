import { describe, expect, test } from "vitest";
import { convertArrayToAsyncIterable } from "./convert-array-to-async-iterable.js";
import { convertAsyncIterableToArray } from "./convert-async-iterable-to-array.js";

describe(`convertArrayToAsyncIterable`, () => {
  test(`should convert empty array`, async () => {
    // Arrange
    const array: Array<number> = [];

    // Act
    const result = await convertAsyncIterableToArray(convertArrayToAsyncIterable(array));

    // Assert
    expect(result).toEqual([]);
  });

  test(`should convert array with items`, async () => {
    // Arrange
    const array = [1, 2, 3];

    // Act
    const result = await convertAsyncIterableToArray(convertArrayToAsyncIterable(array));

    // Assert
    expect(result).toEqual([1, 2, 3]);
  });

  test(`should preserve item order`, async () => {
    // Arrange
    const array = [{ a: 1 }, { b: 2 }, { c: 3 }];

    // Act
    const result = await convertAsyncIterableToArray(convertArrayToAsyncIterable(array));

    // Assert
    expect(result).toEqual([{ a: 1 }, { b: 2 }, { c: 3 }]);
  });
});
