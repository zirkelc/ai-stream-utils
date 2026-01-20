/**
 * Converts a ReadableStream to an array.
 */
export async function convertStreamToArray<T>(
  stream: ReadableStream<T>,
): Promise<Array<T>> {
  const reader = stream.getReader();
  const result: Array<T> = [];

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      result.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  return result;
}
