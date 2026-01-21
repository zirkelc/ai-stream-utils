import {
  convertArrayToReadableStream,
  convertAsyncIterableToArray,
} from '@ai-sdk/provider-utils/test';
import type { UIMessageChunk } from 'ai';
import { describe, expect, it } from 'vitest';
import { mapUIMessageStream } from './map-ui-message-stream.js';
import {
  ABORT_CHUNK,
  ERROR_CHUNK,
  FILE_CHUNKS,
  FINISH_CHUNK,
  MESSAGE_METADATA_CHUNK,
  type MyUIMessage,
  REASONING_CHUNKS,
  START_CHUNK,
  TEXT_CHUNKS,
  TOOL_SERVER_CHUNKS,
  TOOL_WITH_DATA_CHUNKS,
} from './utils/internal/test-utils.js';

describe('mapUIMessageStream', () => {
  it('should pass through all chunks with identity map', async () => {
    const stream = convertArrayToReadableStream([
      START_CHUNK,
      ...TEXT_CHUNKS,
      FINISH_CHUNK,
    ]);

    const mappedStream = mapUIMessageStream(stream, ({ chunk }) => chunk);

    const result = await convertAsyncIterableToArray(mappedStream);

    expect(result).toEqual([START_CHUNK, ...TEXT_CHUNKS, FINISH_CHUNK]);
  });

  it('should filter out chunks by returning null', async () => {
    const stream = convertArrayToReadableStream([
      START_CHUNK,
      ...TEXT_CHUNKS,
      ...REASONING_CHUNKS,
      FINISH_CHUNK,
    ]);

    const mappedStream = mapUIMessageStream(stream, ({ chunk, part }) => {
      return part.type === 'reasoning' ? null : chunk;
    });

    const result = await convertAsyncIterableToArray(mappedStream);

    // Should not include reasoning chunks or the step that only contained reasoning
    expect(result).toEqual([START_CHUNK, ...TEXT_CHUNKS, FINISH_CHUNK]);
  });

  it('should transform chunks', async () => {
    const stream = convertArrayToReadableStream([
      START_CHUNK,
      ...TEXT_CHUNKS,
      FINISH_CHUNK,
    ]);

    const mappedStream = mapUIMessageStream(stream, ({ chunk }) => {
      if (chunk.type === 'text-delta') {
        return { ...chunk, delta: chunk.delta.toUpperCase() };
      }
      return chunk;
    });

    const result = await convertAsyncIterableToArray(mappedStream);

    const textDeltas = result.filter((c) => c.type === 'text-delta');
    expect(textDeltas).toEqual([
      { type: 'text-delta', id: '1', delta: 'HELLO' },
      { type: 'text-delta', id: '1', delta: ' WORLD' },
    ]);
  });

  it('should handle single-chunk parts (file)', async () => {
    const stream = convertArrayToReadableStream([
      START_CHUNK,
      ...FILE_CHUNKS,
      FINISH_CHUNK,
    ]);

    const mappedStream = mapUIMessageStream(stream, ({ chunk, part }) => {
      if (part.type === 'file') {
        expect(chunk.type).toBe('file');
      }
      return chunk;
    });

    const result = await convertAsyncIterableToArray(mappedStream);

    const fileChunks = result.filter((c) => c.type === 'file');
    expect(fileChunks.length).toBe(1);
  });

  it('should always pass through meta chunks', async () => {
    const stream = convertArrayToReadableStream([
      START_CHUNK,
      MESSAGE_METADATA_CHUNK,
      ERROR_CHUNK,
      ABORT_CHUNK,
      FINISH_CHUNK,
    ]);

    // Even when returning null for everything, meta chunks pass through
    const mappedStream = mapUIMessageStream(stream, () => null);

    const result = await convertAsyncIterableToArray(mappedStream);

    expect(result).toEqual([
      START_CHUNK,
      MESSAGE_METADATA_CHUNK,
      ERROR_CHUNK,
      ABORT_CHUNK,
      FINISH_CHUNK,
    ]);
  });

  it('should not emit start-step if all content is filtered out', async () => {
    const stream = convertArrayToReadableStream([
      START_CHUNK,
      ...REASONING_CHUNKS, // Will be filtered
      FINISH_CHUNK,
    ]);

    const mappedStream = mapUIMessageStream(stream, ({ chunk, part }) => {
      return part.type === 'reasoning' ? null : chunk;
    });

    const result = await convertAsyncIterableToArray(mappedStream);

    // Should not include start-step or finish-step since all content was filtered
    expect(result).toEqual([START_CHUNK, FINISH_CHUNK]);
  });

  it('should provide complete tool part', async () => {
    const stream = convertArrayToReadableStream([
      START_CHUNK,
      ...TOOL_SERVER_CHUNKS,
      FINISH_CHUNK,
    ]);

    let capturedPart: unknown;
    const mappedStream = mapUIMessageStream(stream, ({ chunk, part }) => {
      if (part.type === 'tool-weather') {
        capturedPart = part;
      }
      return chunk;
    });

    await convertAsyncIterableToArray(mappedStream);

    // Part should have all tool properties populated
    expect(capturedPart).toMatchObject({
      type: 'tool-weather',
      toolCallId: '3',
      state: 'output-available',
      input: { location: 'NYC' },
      output: { temperature: 65 },
    });
  });

  it('should handle data-* chunks interleaved with tool chunks', async () => {
    const stream = convertArrayToReadableStream([
      START_CHUNK,
      ...TOOL_WITH_DATA_CHUNKS,
      FINISH_CHUNK,
    ]);

    const partTypes: string[] = [];
    const mappedStream = mapUIMessageStream<MyUIMessage>(
      stream,
      ({ chunk, part }) => {
        partTypes.push(part.type);
        return chunk;
      },
    );

    const result = await convertAsyncIterableToArray(mappedStream);

    // All chunks should pass through
    expect(result).toEqual([
      START_CHUNK,
      ...TOOL_WITH_DATA_CHUNKS,
      FINISH_CHUNK,
    ]);

    // Part types should correctly identify tool-weather vs data-weather
    expect(partTypes).toContain('tool-weather');
    expect(partTypes).toContain('data-weather');
  });

  it('should provide partial part with accumulated text', async () => {
    const stream = convertArrayToReadableStream([
      START_CHUNK,
      ...TEXT_CHUNKS,
      FINISH_CHUNK,
    ]);

    const textContents: (string | undefined)[] = [];
    const mappedStream = mapUIMessageStream(stream, ({ chunk, part }) => {
      if (part.type === 'text') {
        // AI SDK's readUIMessageStream accumulates text in part.text
        textContents.push((part as { text?: string }).text);
      }
      return chunk;
    });

    await convertAsyncIterableToArray(mappedStream);

    // AI SDK behavior: text is accumulated, not delta-based
    // text-start: '' (empty), text-delta: 'Hello', text-delta: 'Hello World', text-end: 'Hello World'
    expect(textContents).toEqual(['', 'Hello', 'Hello World', 'Hello World']);
  });

  describe('array', () => {
    it('should emit multiple chunks when returning an array', async () => {
      const stream = convertArrayToReadableStream([
        START_CHUNK,
        ...TEXT_CHUNKS,
        FINISH_CHUNK,
      ]);

      const mappedStream = mapUIMessageStream(stream, ({ chunk }) => {
        // For text-delta chunks, split and emit multiple chunks
        if (chunk.type === 'text-delta') {
          return [{ ...chunk, delta: '[' }, chunk, { ...chunk, delta: ']' }];
        }
        return chunk;
      });

      const result = await convertAsyncIterableToArray(mappedStream);

      const textDeltas = result.filter((c) => c.type === 'text-delta');
      expect(textDeltas).toEqual([
        { type: 'text-delta', id: '1', delta: '[' },
        { type: 'text-delta', id: '1', delta: 'Hello' },
        { type: 'text-delta', id: '1', delta: ']' },
        { type: 'text-delta', id: '1', delta: '[' },
        { type: 'text-delta', id: '1', delta: ' World' },
        { type: 'text-delta', id: '1', delta: ']' },
      ]);
    });

    it('should filter out chunk when returning empty array', async () => {
      const stream = convertArrayToReadableStream([
        START_CHUNK,
        ...TEXT_CHUNKS,
        ...REASONING_CHUNKS,
        FINISH_CHUNK,
      ]);

      const mappedStream = mapUIMessageStream(stream, ({ chunk, part }) => {
        // Return empty array for reasoning (same as returning null)
        return part.type === 'reasoning' ? [] : chunk;
      });

      const result = await convertAsyncIterableToArray(mappedStream);

      // Should not include reasoning chunks
      expect(result).toEqual([START_CHUNK, ...TEXT_CHUNKS, FINISH_CHUNK]);
    });

    it('should handle single chunk in array same as returning chunk directly', async () => {
      const stream = convertArrayToReadableStream([
        START_CHUNK,
        ...TEXT_CHUNKS,
        FINISH_CHUNK,
      ]);

      const mappedStream = mapUIMessageStream(stream, ({ chunk }) => {
        // Return chunk in array - should work same as returning chunk directly
        return [chunk];
      });

      const result = await convertAsyncIterableToArray(mappedStream);

      expect(result).toEqual([START_CHUNK, ...TEXT_CHUNKS, FINISH_CHUNK]);
    });

    it('should not emit step boundary when all content returns empty array', async () => {
      const stream = convertArrayToReadableStream([
        START_CHUNK,
        ...REASONING_CHUNKS,
        FINISH_CHUNK,
      ]);

      const mappedStream = mapUIMessageStream(stream, ({ part }) => {
        // Filter all reasoning by returning empty array
        return part.type === 'reasoning' ? [] : [];
      });

      const result = await convertAsyncIterableToArray(mappedStream);

      // Should not include step boundaries since all content was filtered
      expect(result).toEqual([START_CHUNK, FINISH_CHUNK]);
    });

    it('should support buffering and re-emitting chunks (smooth streaming use case)', async () => {
      const stream = convertArrayToReadableStream([
        START_CHUNK,
        ...TEXT_CHUNKS,
        FINISH_CHUNK,
      ]);

      // Buffer to accumulate text and split by words on text-end
      let buffer = '';
      let textStartChunk: UIMessageChunk | null = null;

      const mappedStream = mapUIMessageStream(stream, ({ chunk }) => {
        if (chunk.type === 'text-start') {
          // Buffer the text-start chunk
          textStartChunk = chunk;
          return [];
        }

        if (chunk.type === 'text-delta') {
          // Buffer the delta, don't emit yet
          buffer += chunk.delta;
          return [];
        }

        if (chunk.type === 'text-end') {
          // Split buffered text into word chunks
          const words = buffer.split(' ').filter((w) => w.length > 0);
          const wordChunks = words.map((word, i) => ({
            type: 'text-delta' as const,
            id: chunk.id,
            delta: i === 0 ? word : ` ${word}`,
          }));
          buffer = '';
          // Emit text-start, word chunks, then text-end
          const chunks: UIMessageChunk[] = [];
          if (textStartChunk) {
            chunks.push(textStartChunk);
            textStartChunk = null;
          }
          chunks.push(...wordChunks, chunk);
          return chunks;
        }

        return chunk;
      });

      const result = await convertAsyncIterableToArray(mappedStream);

      // text-start should be present
      expect(result.filter((c) => c.type === 'text-start')).toHaveLength(1);

      const textDeltas = result.filter((c) => c.type === 'text-delta');
      // Original was "Hello" + " World", now split by words
      expect(textDeltas).toEqual([
        { type: 'text-delta', id: '1', delta: 'Hello' },
        { type: 'text-delta', id: '1', delta: ' World' },
      ]);

      // text-end should still be present
      expect(result.filter((c) => c.type === 'text-end')).toHaveLength(1);
    });
  });
});
