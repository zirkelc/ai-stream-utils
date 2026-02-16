import { bench, describe } from "vitest";
import type { MyUIMessage, MyUIMessageChunk } from "../test/ui-message.js";
import { convertArrayToStream } from "../utils/convert-array-to-stream.js";
import { convertAsyncIterableToArray } from "../utils/convert-async-iterable-to-array.js";
import { pipe } from "./pipe.js";

/* Generate 1,000 text chunks for benchmarking */
const TEXT_DELTA_CHUNKS: Array<MyUIMessageChunk> = Array.from({ length: 1_000 }, (_, i) => ({
  type: `text-delta`,
  id: `1`,
  delta: `chunk ${i}`,
}));

const BENCHMARK_CHUNKS: Array<MyUIMessageChunk> = [
  { type: `start` },
  { type: `start-step` },
  { type: `text-start`, id: `1` },
  ...TEXT_DELTA_CHUNKS,
  { type: `text-end`, id: `1` },
  { type: `finish-step` },
  { type: `finish` },
];

describe(`pipe overhead`, () => {
  bench(`baseline - raw stream iteration`, async () => {
    const stream = convertArrayToStream(BENCHMARK_CHUNKS);
    await convertAsyncIterableToArray(stream);
  });

  bench(`empty pipeline`, async () => {
    const stream = convertArrayToStream(BENCHMARK_CHUNKS);
    await convertAsyncIterableToArray(pipe<MyUIMessage>(stream).toStream());
  });

  bench(`1x map`, async () => {
    const stream = convertArrayToStream(BENCHMARK_CHUNKS);
    await convertAsyncIterableToArray(
      pipe<MyUIMessage>(stream)
        .map(({ chunk }) => chunk)
        .toStream(),
    );
  });

  bench(`2x map`, async () => {
    const stream = convertArrayToStream(BENCHMARK_CHUNKS);
    await convertAsyncIterableToArray(
      pipe<MyUIMessage>(stream)
        .map(({ chunk }) => chunk)
        .map(({ chunk }) => chunk)
        .toStream(),
    );
  });

  bench(`5x map`, async () => {
    const stream = convertArrayToStream(BENCHMARK_CHUNKS);
    await convertAsyncIterableToArray(
      pipe<MyUIMessage>(stream)
        .map(({ chunk }) => chunk)
        .map(({ chunk }) => chunk)
        .map(({ chunk }) => chunk)
        .map(({ chunk }) => chunk)
        .map(({ chunk }) => chunk)
        .toStream(),
    );
  });

  bench(`10x map`, async () => {
    const stream = convertArrayToStream(BENCHMARK_CHUNKS);
    await convertAsyncIterableToArray(
      pipe<MyUIMessage>(stream)
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
