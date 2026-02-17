/**
 * Converts an array to an AsyncIterable.
 */
export async function* convertArrayToAsyncIterable<T>(array: Array<T>): AsyncIterable<T> {
  for (const item of array) {
    yield item;
  }
}
