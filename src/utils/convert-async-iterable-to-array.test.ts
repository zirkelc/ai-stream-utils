import { describe, expect, test } from "vitest";
import { convertAsyncIterableToArray } from "./convert-async-iterable-to-array.js";

describe(`convertAsyncIterableToArray`, () => {
  test(`should convert async iterable to array`, async () => {
    // Arrange
    async function* generator() {
      yield 1;
      yield 2;
      yield 3;
    }

    // Act
    const result = await convertAsyncIterableToArray(generator());

    // Assert
    expect(result).toEqual([1, 2, 3]);
  });

  test(`should handle empty async iterable`, async () => {
    // Arrange
    async function* generator() {
      /** empty */
    }

    // Act
    const result = await convertAsyncIterableToArray(generator());

    // Assert
    expect(result).toEqual([]);
  });

  test(`should handle async iterable with objects`, async () => {
    // Arrange
    async function* generator() {
      yield { a: 1 };
      yield { b: 2 };
    }

    // Act
    const result = await convertAsyncIterableToArray(generator());

    // Assert
    expect(result).toEqual([{ a: 1 }, { b: 2 }]);
  });
});
