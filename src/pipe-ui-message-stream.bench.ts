import {
  convertArrayToReadableStream,
  convertAsyncIterableToArray,
} from '@ai-sdk/provider-utils/test';
import { bench, describe } from 'vitest';
import { pipeUIMessageStream } from './pipe-ui-message-stream.js';
import type {
  MyUIMessage,
  MyUIMessageChunk,
} from './utils/internal/test-utils.js';

/* Generate 1,000 text chunks for benchmarking */
const TEXT_DELTA_CHUNKS: Array<MyUIMessageChunk> = Array.from(
  { length: 1_000 },
  (_, i) => ({
    type: `text-delta`,
    id: `1`,
    delta: `chunk ${i}`,
  }),
);

const BENCHMARK_CHUNKS: Array<MyUIMessageChunk> = [
  { type: `start` },
  { type: `start-step` },
  { type: `text-start`, id: `1` },
  ...TEXT_DELTA_CHUNKS,
  { type: `text-end`, id: `1` },
  { type: `finish-step` },
  { type: `finish` },
];

describe(`pipeUIMessageStream overhead`, () => {
  bench(`baseline - raw stream iteration`, async () => {
    const stream = convertArrayToReadableStream(BENCHMARK_CHUNKS);
    await convertAsyncIterableToArray(stream);
  });

  bench(`empty pipeline`, async () => {
    const stream = convertArrayToReadableStream(BENCHMARK_CHUNKS);
    await convertAsyncIterableToArray(
      pipeUIMessageStream<MyUIMessage>(stream).toStream(),
    );
  });

  bench(`1x map`, async () => {
    const stream = convertArrayToReadableStream(BENCHMARK_CHUNKS);
    await convertAsyncIterableToArray(
      pipeUIMessageStream<MyUIMessage>(stream)
        .map(({ chunk }) => chunk)
        .toStream(),
    );
  });

  bench(`2x map`, async () => {
    const stream = convertArrayToReadableStream(BENCHMARK_CHUNKS);
    await convertAsyncIterableToArray(
      pipeUIMessageStream<MyUIMessage>(stream)
        .map(({ chunk }) => chunk)
        .map(({ chunk }) => chunk)
        .toStream(),
    );
  });

  bench(`5x map`, async () => {
    const stream = convertArrayToReadableStream(BENCHMARK_CHUNKS);
    await convertAsyncIterableToArray(
      pipeUIMessageStream<MyUIMessage>(stream)
        .map(({ chunk }) => chunk)
        .map(({ chunk }) => chunk)
        .map(({ chunk }) => chunk)
        .map(({ chunk }) => chunk)
        .map(({ chunk }) => chunk)
        .toStream(),
    );
  });

  bench(`10x map`, async () => {
    const stream = convertArrayToReadableStream(BENCHMARK_CHUNKS);
    await convertAsyncIterableToArray(
      pipeUIMessageStream<MyUIMessage>(stream)
        .map(({ chunk }) => chunk)
        .map(({ chunk }) => chunk)
        .map(({ chunk }) => chunk)
        .map(({ chunk }) => chunk)
        .map(({ chunk }) => chunk)
        .map(({ chunk }) => chunk)
        .map(({ chunk }) => chunk)
        .map(({ chunk }) => chunk)
        .map(({ chunk }) => chunk)
        .map(({ chunk }) => chunk)
        .toStream(),
    );
  });
});
