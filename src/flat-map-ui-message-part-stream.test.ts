import {
  convertArrayToReadableStream,
  convertAsyncIterableToArray,
} from '@ai-sdk/provider-utils/test';
import type { InferUIMessageChunk, UIMessage } from 'ai';
import { describe, expect, it } from 'vitest';
import {
  flatMapUIMessagePartStream,
  type PartFlatMapInput,
} from './flat-map-ui-message-part-stream.js';

type MyUIMessage = UIMessage;
type MyUIMessageChunk = InferUIMessageChunk<MyUIMessage>;

const START_CHUNK: MyUIMessageChunk = { type: 'start' };
const FINISH_CHUNK: MyUIMessageChunk = { type: 'finish' };

const TEXT_CHUNKS: MyUIMessageChunk[] = [
  { type: 'start-step' },
  { type: 'text-start', id: '1' },
  { type: 'text-delta', id: '1', delta: 'Hello' },
  { type: 'text-delta', id: '1', delta: ' World' },
  { type: 'text-end', id: '1' },
  { type: 'finish-step' },
];

const REASONING_CHUNKS: MyUIMessageChunk[] = [
  { type: 'start-step' },
  { type: 'reasoning-start', id: '2' },
  { type: 'reasoning-delta', id: '2', delta: 'Thinking...' },
  { type: 'reasoning-end', id: '2' },
  { type: 'finish-step' },
];

const TOOL_CHUNKS: MyUIMessageChunk[] = [
  { type: 'start-step' },
  {
    type: 'tool-input-start',
    toolCallId: '3',
    toolName: 'weather',
  },
  {
    type: 'tool-input-available',
    toolCallId: '3',
    toolName: 'weather',
    input: { location: 'NYC' },
  },
  {
    type: 'tool-output-available',
    toolCallId: '3',
    output: { temperature: 65 },
  },
  { type: 'finish-step' },
];

const FILE_CHUNK: MyUIMessageChunk = {
  type: 'file',
  url: 'https://example.com/file.pdf',
  mediaType: 'application/pdf',
};

describe('flatMapUIMessagePartStream', () => {
  it('should pass through all parts with identity flatMap', async () => {
    const stream = convertArrayToReadableStream([
      START_CHUNK,
      ...TEXT_CHUNKS,
      FINISH_CHUNK,
    ]);

    const mappedStream = flatMapUIMessagePartStream(stream, ({ part }) => part);

    const result = await convertAsyncIterableToArray(mappedStream);

    expect(result).toEqual([START_CHUNK, ...TEXT_CHUNKS, FINISH_CHUNK]);
  });

  it('should filter out parts by returning null', async () => {
    const stream = convertArrayToReadableStream([
      START_CHUNK,
      ...TEXT_CHUNKS,
      ...REASONING_CHUNKS,
      FINISH_CHUNK,
    ]);

    const mappedStream = flatMapUIMessagePartStream(stream, ({ part }) => {
      return part.type === 'reasoning' ? null : part;
    });

    const result = await convertAsyncIterableToArray(mappedStream);

    // Should not include reasoning chunks
    expect(result).toEqual([START_CHUNK, ...TEXT_CHUNKS, FINISH_CHUNK]);
  });

  it('should transform parts', async () => {
    const stream = convertArrayToReadableStream([
      START_CHUNK,
      ...TEXT_CHUNKS,
      FINISH_CHUNK,
    ]);

    const mappedStream = flatMapUIMessagePartStream(stream, ({ part }) => {
      if (part.type === 'text') {
        const textPart = part as { type: 'text'; text: string };
        return { ...textPart, text: textPart.text.toUpperCase() };
      }
      return part;
    });

    const result = await convertAsyncIterableToArray(mappedStream);

    // Find the text delta - it should be uppercase
    const textDeltas = result.filter((c) => c.type === 'text-delta');
    expect(textDeltas.length).toBe(1);
    expect((textDeltas[0] as { delta: string }).delta).toBe('HELLO WORLD');
  });

  it('should expand parts into multiple parts', async () => {
    const stream = convertArrayToReadableStream([
      START_CHUNK,
      ...TEXT_CHUNKS,
      FINISH_CHUNK,
    ]);

    const mappedStream = flatMapUIMessagePartStream(stream, ({ part }) => {
      if (part.type === 'text') {
        const textPart = part as { type: 'text'; text: string };
        // Split into two parts
        return [
          { ...textPart, text: 'Part 1' },
          { ...textPart, text: 'Part 2' },
        ];
      }
      return part;
    });

    const result = await convertAsyncIterableToArray(mappedStream);

    // Should have two text-delta chunks now
    const textDeltas = result.filter((c) => c.type === 'text-delta');
    expect(textDeltas.length).toBe(2);
    expect((textDeltas[0] as { delta: string }).delta).toBe('Part 1');
    expect((textDeltas[1] as { delta: string }).delta).toBe('Part 2');
  });

  it('should provide access to original chunks', async () => {
    const stream = convertArrayToReadableStream([
      START_CHUNK,
      ...TEXT_CHUNKS,
      FINISH_CHUNK,
    ]);

    let capturedChunks: MyUIMessageChunk[] = [];
    const mappedStream = flatMapUIMessagePartStream(
      stream,
      ({ part, chunks }) => {
        capturedChunks = chunks;
        return part;
      },
    );

    await convertAsyncIterableToArray(mappedStream);

    // Should have captured the text chunks (without step boundaries)
    expect(capturedChunks.length).toBe(4); // text-start, 2x text-delta, text-end
    expect(capturedChunks[0]?.type).toBe('text-start');
    expect(capturedChunks[3]?.type).toBe('text-end');
  });

  it('should handle single-chunk parts (file)', async () => {
    const stream = convertArrayToReadableStream([
      START_CHUNK,
      { type: 'start-step' } as MyUIMessageChunk,
      FILE_CHUNK,
      { type: 'finish-step' } as MyUIMessageChunk,
      FINISH_CHUNK,
    ]);

    const mappedStream = flatMapUIMessagePartStream(stream, ({ part }) => {
      expect(part.type).toBe('file');
      return part;
    });

    const result = await convertAsyncIterableToArray(mappedStream);

    const fileChunks = result.filter((c) => c.type === 'file');
    expect(fileChunks.length).toBe(1);
  });

  it('should reconstruct tool parts correctly', async () => {
    const stream = convertArrayToReadableStream([
      START_CHUNK,
      ...TOOL_CHUNKS,
      FINISH_CHUNK,
    ]);

    let capturedPart: unknown;
    const mappedStream = flatMapUIMessagePartStream(stream, ({ part }) => {
      if (part.type === 'tool-weather') {
        capturedPart = part;
      }
      return part;
    });

    await convertAsyncIterableToArray(mappedStream);

    expect(capturedPart).toMatchObject({
      type: 'tool-weather',
      toolName: 'weather',
      toolCallId: '3',
      state: 'output-available',
      input: { location: 'NYC' },
      output: { temperature: 65 },
    });
  });

  it('should always pass through meta chunks immediately', async () => {
    const ERROR_CHUNK: MyUIMessageChunk = {
      type: 'error',
      errorText: 'Test error',
    };

    const stream = convertArrayToReadableStream([
      START_CHUNK,
      ERROR_CHUNK,
      FINISH_CHUNK,
    ]);

    const mappedStream = flatMapUIMessagePartStream(stream, () => null);

    const result = await convertAsyncIterableToArray(mappedStream);

    expect(result).toEqual([START_CHUNK, ERROR_CHUNK, FINISH_CHUNK]);
  });

  it('should not emit start-step if all content is filtered out', async () => {
    const stream = convertArrayToReadableStream([
      START_CHUNK,
      ...REASONING_CHUNKS,
      FINISH_CHUNK,
    ]);

    const mappedStream = flatMapUIMessagePartStream(stream, () => null);

    const result = await convertAsyncIterableToArray(mappedStream);

    // Should not include start-step or finish-step
    expect(result).toEqual([START_CHUNK, FINISH_CHUNK]);
  });

  it('should provide index and parts array in context', async () => {
    const stream = convertArrayToReadableStream([
      START_CHUNK,
      ...TEXT_CHUNKS,
      ...REASONING_CHUNKS,
      FINISH_CHUNK,
    ]);

    const indices: number[] = [];
    const partCounts: number[] = [];
    const mappedStream = flatMapUIMessagePartStream(
      stream,
      ({ part }, { index, parts }) => {
        indices.push(index);
        partCounts.push(parts.length);
        return part;
      },
    );

    await convertAsyncIterableToArray(mappedStream);

    // Index should increment for each part
    expect(indices).toEqual([0, 1]);
    // Parts array should grow with each part
    expect(partCounts).toEqual([1, 2]);
  });

  it('should allow accessing previous parts', async () => {
    const stream = convertArrayToReadableStream([
      START_CHUNK,
      ...TEXT_CHUNKS,
      ...REASONING_CHUNKS,
      FINISH_CHUNK,
    ]);

    let lastPartsSnapshot: PartFlatMapInput<MyUIMessage>[] = [];
    const mappedStream = flatMapUIMessagePartStream(
      stream,
      ({ part }, { parts }) => {
        lastPartsSnapshot = [...parts];
        return part;
      },
    );

    await convertAsyncIterableToArray(mappedStream);

    // Should have all parts at the end
    expect(lastPartsSnapshot.length).toBe(2);
    expect(lastPartsSnapshot[0]?.part.type).toBe('text');
    expect(lastPartsSnapshot[1]?.part.type).toBe('reasoning');
  });
});
