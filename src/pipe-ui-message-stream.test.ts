import {
  convertArrayToReadableStream,
  convertAsyncIterableToArray,
} from '@ai-sdk/provider-utils/test';
import { describe, expect, it } from 'vitest';
import { excludeParts, includeParts } from './filter-ui-message-stream.js';
import { partTypeIs } from './flat-map-ui-message-stream.js';
import { pipeUIMessageStream } from './pipe-ui-message-stream.js';
import {
  FINISH_CHUNK,
  type MyUIMessage,
  REASONING_CHUNKS,
  START_CHUNK,
  TEXT_CHUNKS,
} from './utils/test-utils.js';

describe(`pipeUIMessageStream`, () => {
  describe(`empty pipeline`, () => {
    it(`should return original stream when no operations are added`, async () => {
      /* Arrange */
      const stream = convertArrayToReadableStream([
        START_CHUNK,
        ...TEXT_CHUNKS,
        FINISH_CHUNK,
      ]);

      /* Act */
      const result = await convertAsyncIterableToArray(
        pipeUIMessageStream<MyUIMessage>(stream).toStream(),
      );

      /* Assert */
      expect(result).toEqual([START_CHUNK, ...TEXT_CHUNKS, FINISH_CHUNK]);
    });
  });

  describe(`single operations`, () => {
    it(`should apply single filter operation`, async () => {
      /* Arrange */
      const stream = convertArrayToReadableStream([
        START_CHUNK,
        ...TEXT_CHUNKS,
        ...REASONING_CHUNKS,
        FINISH_CHUNK,
      ]);

      /* Act */
      const result = await convertAsyncIterableToArray(
        pipeUIMessageStream<MyUIMessage>(stream)
          .filter(includeParts([`text`]))
          .toStream(),
      );

      /* Assert */
      expect(result).toEqual([START_CHUNK, ...TEXT_CHUNKS, FINISH_CHUNK]);
    });

    it(`should apply single map operation`, async () => {
      /* Arrange */
      const stream = convertArrayToReadableStream([
        START_CHUNK,
        ...TEXT_CHUNKS,
        FINISH_CHUNK,
      ]);

      /* Act */
      const result = await convertAsyncIterableToArray(
        pipeUIMessageStream<MyUIMessage>(stream)
          .map(({ chunk }) => {
            if (chunk.type === `text-delta`) {
              return { ...chunk, delta: chunk.delta.toUpperCase() };
            }
            return chunk;
          })
          .toStream(),
      );

      /* Assert */
      const textDeltas = result.filter((c) => c.type === `text-delta`);
      expect(textDeltas).toEqual([
        { type: `text-delta`, id: `1`, delta: `HELLO` },
        { type: `text-delta`, id: `1`, delta: ` WORLD` },
      ]);
    });

    it(`should apply single flatMap operation`, async () => {
      /* Arrange */
      const stream = convertArrayToReadableStream([
        START_CHUNK,
        ...TEXT_CHUNKS,
        ...REASONING_CHUNKS,
        FINISH_CHUNK,
      ]);

      /* Act */
      const result = await convertAsyncIterableToArray(
        pipeUIMessageStream<MyUIMessage>(stream)
          .flatMap(({ part }) => {
            if (part.type === `reasoning`) return null;
            return part;
          })
          .toStream(),
      );

      /* Assert */
      /* flatMap buffers entire parts, so text deltas are combined */
      expect(result.length).toBe(7);
      expect(result[0]).toEqual(START_CHUNK);
      expect(result[result.length - 1]).toEqual(FINISH_CHUNK);

      const textDeltas = result.filter((c) => c.type === `text-delta`);
      expect(textDeltas.length).toBe(1);
      expect(textDeltas[0]).toMatchObject({
        type: `text-delta`,
        delta: `Hello World`,
      });

      /* Reasoning chunks should be filtered out */
      const reasoningChunks = result.filter((c) =>
        c.type.startsWith(`reasoning`),
      );
      expect(reasoningChunks.length).toBe(0);
    });

    it(`should apply flatMap with predicate`, async () => {
      /* Arrange */
      const stream = convertArrayToReadableStream([
        START_CHUNK,
        ...TEXT_CHUNKS,
        FINISH_CHUNK,
      ]);

      /* Act */
      const result = await convertAsyncIterableToArray(
        pipeUIMessageStream<MyUIMessage>(stream)
          .flatMap(partTypeIs(`text`), ({ part }) => ({
            ...part,
            text: part.text.toUpperCase(),
          }))
          .toStream(),
      );

      /* Assert */
      const textDeltas = result.filter((c) => c.type === `text-delta`);
      expect(textDeltas).toEqual([
        { type: `text-delta`, id: `1`, delta: `HELLO WORLD` },
      ]);
    });
  });

  describe(`chained operations`, () => {
    it(`should apply multiple filter operations`, async () => {
      /* Arrange */
      const stream = convertArrayToReadableStream([
        START_CHUNK,
        ...TEXT_CHUNKS,
        ...REASONING_CHUNKS,
        FINISH_CHUNK,
      ]);

      /* Act */
      const result = await convertAsyncIterableToArray(
        pipeUIMessageStream<MyUIMessage>(stream)
          .filter(includeParts([`text`, `reasoning`]))
          .filter(excludeParts([`reasoning`]))
          .toStream(),
      );

      /* Assert */
      expect(result).toEqual([START_CHUNK, ...TEXT_CHUNKS, FINISH_CHUNK]);
    });

    it(`should apply filter then map`, async () => {
      /* Arrange */
      const stream = convertArrayToReadableStream([
        START_CHUNK,
        ...TEXT_CHUNKS,
        ...REASONING_CHUNKS,
        FINISH_CHUNK,
      ]);

      /* Act */
      const result = await convertAsyncIterableToArray(
        pipeUIMessageStream<MyUIMessage>(stream)
          .filter(includeParts([`text`]))
          .map(({ chunk }) => {
            if (chunk.type === `text-delta`) {
              return { ...chunk, delta: chunk.delta.toUpperCase() };
            }
            return chunk;
          })
          .toStream(),
      );

      /* Assert */
      const textDeltas = result.filter((c) => c.type === `text-delta`);
      expect(textDeltas).toEqual([
        { type: `text-delta`, id: `1`, delta: `HELLO` },
        { type: `text-delta`, id: `1`, delta: ` WORLD` },
      ]);
    });

    it(`should apply map then filter`, async () => {
      /* Arrange */
      const stream = convertArrayToReadableStream([
        START_CHUNK,
        ...TEXT_CHUNKS,
        ...REASONING_CHUNKS,
        FINISH_CHUNK,
      ]);

      /* Act */
      const result = await convertAsyncIterableToArray(
        pipeUIMessageStream<MyUIMessage>(stream)
          .map(({ chunk }) => {
            if (chunk.type === `text-delta`) {
              return { ...chunk, delta: chunk.delta.toUpperCase() };
            }
            return chunk;
          })
          .filter(includeParts([`text`]))
          .toStream(),
      );

      /* Assert */
      const textDeltas = result.filter((c) => c.type === `text-delta`);
      expect(textDeltas).toEqual([
        { type: `text-delta`, id: `1`, delta: `HELLO` },
        { type: `text-delta`, id: `1`, delta: ` WORLD` },
      ]);
    });

    it(`should apply filter, map, and flatMap together`, async () => {
      /* Arrange */
      const stream = convertArrayToReadableStream([
        START_CHUNK,
        ...TEXT_CHUNKS,
        ...REASONING_CHUNKS,
        FINISH_CHUNK,
      ]);

      /* Act */
      const result = await convertAsyncIterableToArray(
        pipeUIMessageStream<MyUIMessage>(stream)
          .filter(includeParts([`text`, `reasoning`]))
          .map(({ chunk }) => {
            if (chunk.type === `text-delta`) {
              return { ...chunk, delta: chunk.delta.toUpperCase() };
            }
            return chunk;
          })
          .flatMap(({ part }) => {
            if (part.type === `reasoning`) return null;
            return part;
          })
          .toStream(),
      );

      /* Assert */
      /* Note: flatMap buffers the entire part, so we get single text-delta with full text */
      const textDeltas = result.filter((c) => c.type === `text-delta`);
      expect(textDeltas.length).toBe(1);
      expect(textDeltas[0]).toMatchObject({
        type: `text-delta`,
        delta: `HELLO WORLD`,
      });
    });
  });

  describe(`AsyncIterable usage`, () => {
    it(`should be usable with for-await-of directly`, async () => {
      /* Arrange */
      const stream = convertArrayToReadableStream([
        START_CHUNK,
        ...TEXT_CHUNKS,
        FINISH_CHUNK,
      ]);
      const pipeline = pipeUIMessageStream<MyUIMessage>(stream).filter(
        includeParts([`text`]),
      );

      /* Act */
      const result = [];
      for await (const chunk of pipeline) {
        result.push(chunk);
      }

      /* Assert */
      expect(result).toEqual([START_CHUNK, ...TEXT_CHUNKS, FINISH_CHUNK]);
    });
  });

  describe(`consumed pipeline`, () => {
    it(`should throw error when toStream is called twice`, async () => {
      /* Arrange */
      const stream = convertArrayToReadableStream([
        START_CHUNK,
        ...TEXT_CHUNKS,
        FINISH_CHUNK,
      ]);
      const pipeline = pipeUIMessageStream<MyUIMessage>(stream).filter(
        includeParts([`text`]),
      );

      /* Act */
      pipeline.toStream();
      const result = () => pipeline.toStream();

      /* Assert */
      expect(result).toThrow();
    });

    it(`should throw error when iterating twice`, async () => {
      /* Arrange */
      const stream = convertArrayToReadableStream([
        START_CHUNK,
        ...TEXT_CHUNKS,
        FINISH_CHUNK,
      ]);
      const pipeline = pipeUIMessageStream<MyUIMessage>(stream).filter(
        includeParts([`text`]),
      );

      /* Act */
      await convertAsyncIterableToArray(pipeline);
      const result = convertAsyncIterableToArray(pipeline);

      /* Assert */
      await expect(result).rejects.toThrow();
    });

    it(`should throw error when toStream called after iteration`, async () => {
      /* Arrange */
      const stream = convertArrayToReadableStream([
        START_CHUNK,
        ...TEXT_CHUNKS,
        FINISH_CHUNK,
      ]);
      const pipeline = pipeUIMessageStream<MyUIMessage>(stream).filter(
        includeParts([`text`]),
      );

      /* Act */
      await convertAsyncIterableToArray(pipeline);
      const result = () => pipeline.toStream();

      /* Assert */
      expect(result).toThrow();
    });
  });
});
