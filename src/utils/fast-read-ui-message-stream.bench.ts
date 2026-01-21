import {
  convertArrayToReadableStream,
  convertAsyncIterableToArray,
} from '@ai-sdk/provider-utils/test';
import { readUIMessageStream } from 'ai';
import { bench, describe } from 'vitest';
import { fastReadUIMessageStream } from './fast-read-ui-message-stream.js';
import type { MyUIMessage, MyUIMessageChunk } from './test-utils.js';

/* Generate text chunks for benchmarking */
function createTextChunks(count: number): Array<MyUIMessageChunk> {
  return Array.from({ length: count }, (_, i) => ({
    type: `text-delta` as const,
    id: `1`,
    delta: `chunk ${i} `,
  }));
}

/* Generate tool input delta chunks for benchmarking (expensive in AI SDK due to JSON parsing) */
function createToolInputDeltaChunks(count: number): Array<MyUIMessageChunk> {
  return Array.from({ length: count }, (_, i) => ({
    type: `tool-input-delta` as const,
    toolCallId: `tool-1`,
    inputTextDelta:
      i === 0 ? `{"key${i}":"value${i}"` : `,"key${i}":"value${i}"`,
  }));
}

const SMALL_TEXT_CHUNKS = createTextChunks(100);
const MEDIUM_TEXT_CHUNKS = createTextChunks(1_000);
const LARGE_TEXT_CHUNKS = createTextChunks(5_000);

const TOOL_INPUT_DELTA_CHUNKS = createToolInputDeltaChunks(100);

function createTextStream(
  textChunks: Array<MyUIMessageChunk>,
): Array<MyUIMessageChunk> {
  return [
    { type: `start`, messageId: `msg-1` },
    { type: `start-step` },
    { type: `text-start`, id: `1` },
    ...textChunks,
    { type: `text-end`, id: `1` },
    { type: `finish-step` },
    { type: `finish` },
  ];
}

function createToolStream(): Array<MyUIMessageChunk> {
  return [
    { type: `start`, messageId: `msg-1` },
    { type: `start-step` },
    { type: `tool-input-start`, toolCallId: `tool-1`, toolName: `weather` },
    ...TOOL_INPUT_DELTA_CHUNKS,
    {
      type: `tool-input-available`,
      toolCallId: `tool-1`,
      toolName: `weather`,
      input: { location: `NYC` },
    },
    {
      type: `tool-output-available`,
      toolCallId: `tool-1`,
      output: { temperature: 72 },
    },
    { type: `finish-step` },
    { type: `finish` },
  ];
}

/**
 * Helper to collect messages (cloning for AI SDK comparison since fast version mutates)
 */
async function collectMessages<T>(
  generator: AsyncGenerator<T>,
): Promise<Array<T>> {
  const results: Array<T> = [];
  for await (const item of generator) {
    results.push(structuredClone(item));
  }
  return results;
}

describe(`fastReadUIMessageStream vs AI SDK readUIMessageStream`, () => {
  describe(`small text stream (100 deltas)`, () => {
    const chunks = createTextStream(SMALL_TEXT_CHUNKS);

    bench(`AI SDK readUIMessageStream`, async () => {
      const stream = convertArrayToReadableStream(chunks);
      await convertAsyncIterableToArray(
        readUIMessageStream<MyUIMessage>({ stream }),
      );
    });

    bench(`fastReadUIMessageStream`, async () => {
      const stream = convertArrayToReadableStream(chunks);
      await collectMessages(fastReadUIMessageStream<MyUIMessage>(stream));
    });

    bench(`fastReadUIMessageStream (no clone)`, async () => {
      const stream = convertArrayToReadableStream(chunks);
      await convertAsyncIterableToArray(
        fastReadUIMessageStream<MyUIMessage>(stream),
      );
    });
  });

  describe(`medium text stream (1,000 deltas)`, () => {
    const chunks = createTextStream(MEDIUM_TEXT_CHUNKS);

    bench(`AI SDK readUIMessageStream`, async () => {
      const stream = convertArrayToReadableStream(chunks);
      await convertAsyncIterableToArray(
        readUIMessageStream<MyUIMessage>({ stream }),
      );
    });

    bench(`fastReadUIMessageStream`, async () => {
      const stream = convertArrayToReadableStream(chunks);
      await collectMessages(fastReadUIMessageStream<MyUIMessage>(stream));
    });

    bench(`fastReadUIMessageStream (no clone)`, async () => {
      const stream = convertArrayToReadableStream(chunks);
      await convertAsyncIterableToArray(
        fastReadUIMessageStream<MyUIMessage>(stream),
      );
    });
  });

  describe(`large text stream (5,000 deltas)`, () => {
    const chunks = createTextStream(LARGE_TEXT_CHUNKS);

    bench(`AI SDK readUIMessageStream`, async () => {
      const stream = convertArrayToReadableStream(chunks);
      await convertAsyncIterableToArray(
        readUIMessageStream<MyUIMessage>({ stream }),
      );
    });

    bench(`fastReadUIMessageStream`, async () => {
      const stream = convertArrayToReadableStream(chunks);
      await collectMessages(fastReadUIMessageStream<MyUIMessage>(stream));
    });

    bench(`fastReadUIMessageStream (no clone)`, async () => {
      const stream = convertArrayToReadableStream(chunks);
      await convertAsyncIterableToArray(
        fastReadUIMessageStream<MyUIMessage>(stream),
      );
    });
  });

  describe(`tool stream with 100 input deltas (JSON parsing heavy)`, () => {
    const chunks = createToolStream();

    bench(`AI SDK readUIMessageStream`, async () => {
      const stream = convertArrayToReadableStream(chunks);
      await convertAsyncIterableToArray(
        readUIMessageStream<MyUIMessage>({ stream }),
      );
    });

    bench(`fastReadUIMessageStream`, async () => {
      const stream = convertArrayToReadableStream(chunks);
      await collectMessages(fastReadUIMessageStream<MyUIMessage>(stream));
    });

    bench(`fastReadUIMessageStream (no clone)`, async () => {
      const stream = convertArrayToReadableStream(chunks);
      await convertAsyncIterableToArray(
        fastReadUIMessageStream<MyUIMessage>(stream),
      );
    });
  });
});
