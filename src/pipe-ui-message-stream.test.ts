import {
  convertArrayToReadableStream,
  convertAsyncIterableToArray,
} from '@ai-sdk/provider-utils/test';
import { describe, expect, it } from 'vitest';
import { excludeParts, includeParts } from './filter-ui-message-stream.js';
import { partType, pipeUIMessageStream } from './pipe-ui-message-stream.js';
import {
  FINISH_CHUNK,
  type MyUIMessage,
  REASONING_CHUNKS,
  START_CHUNK,
  TEXT_CHUNKS,
  TOOL_SERVER_CHUNKS,
  TOOL_WITH_DATA_CHUNKS,
} from './utils/internal/test-utils.js';

/** Content-only chunks (no step boundaries) for testing toStream() output */
const TEXT_CONTENT_CHUNKS = TEXT_CHUNKS.filter(
  (c) => c.type !== `start-step` && c.type !== `finish-step`,
);
const REASONING_CONTENT_CHUNKS = REASONING_CHUNKS.filter(
  (c) => c.type !== `start-step` && c.type !== `finish-step`,
);

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

      /* Assert - only content chunks are returned (no meta/step chunks) */
      expect(result).toEqual(TEXT_CONTENT_CHUNKS);
    });
  });

  describe(`filter`, () => {
    it(`should apply includeParts filter`, async () => {
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

      /* Assert - only text content chunks are returned */
      expect(result).toEqual(TEXT_CONTENT_CHUNKS);
    });

    it(`should apply excludeParts filter`, async () => {
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
          .filter(excludeParts([`reasoning`]))
          .toStream(),
      );

      /* Assert - only text content chunks are returned */
      expect(result).toEqual(TEXT_CONTENT_CHUNKS);
    });

    it(`should apply includeParts and excludeParts combined`, async () => {
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

      /* Assert - only text content chunks are returned */
      expect(result).toEqual(TEXT_CONTENT_CHUNKS);
    });
  });

  describe(`map`, () => {
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
  });

  describe(`scan`, () => {
    it(`should accumulate state across chunks`, async () => {
      /* Arrange */
      const stream = convertArrayToReadableStream([
        START_CHUNK,
        ...TEXT_CHUNKS,
        FINISH_CHUNK,
      ]);

      /* Act */
      const result = await convertAsyncIterableToArray(
        pipeUIMessageStream<MyUIMessage>(stream)
          .scan({
            initial: () => ({ count: 0 }),
            reducer: (state, { chunk }) => {
              state.count++;
              if (chunk.type === `text-delta`) {
                return { ...chunk, delta: `[${state.count}] ${chunk.delta}` };
              }
              return chunk;
            },
          })
          .toStream(),
      );

      /* Assert */
      const textDeltas = result.filter((c) => c.type === `text-delta`);
      expect(textDeltas).toEqual([
        { type: `text-delta`, id: `1`, delta: `[2] Hello` },
        { type: `text-delta`, id: `1`, delta: `[3]  World` },
      ]);
    });

    it(`should call finalize at stream end`, async () => {
      /* Arrange */
      const stream = convertArrayToReadableStream([
        START_CHUNK,
        ...TEXT_CHUNKS,
        FINISH_CHUNK,
      ]);

      /* Act */
      const result = await convertAsyncIterableToArray(
        pipeUIMessageStream<MyUIMessage>(stream)
          .scan({
            initial: () => ({ buffer: `` }),
            reducer: (state, { chunk }) => {
              if (chunk.type === `text-delta`) {
                state.buffer += chunk.delta;
                return null; /** Don't emit yet */
              }
              return chunk;
            },
            finalize: (state) => {
              /** Emit buffered content at end */
              if (state.buffer) {
                return {
                  type: `text-delta` as const,
                  id: `1`,
                  delta: state.buffer,
                };
              }
              return null;
            },
          })
          .toStream(),
      );

      /* Assert */
      const textDeltas = result.filter((c) => c.type === `text-delta`);
      expect(textDeltas.length).toBe(1);
      expect(textDeltas[0]).toEqual({
        type: `text-delta`,
        id: `1`,
        delta: `Hello World`,
      });
    });

    it(`should emit multiple chunks from step function`, async () => {
      /* Arrange */
      const stream = convertArrayToReadableStream([
        START_CHUNK,
        ...TEXT_CHUNKS,
        FINISH_CHUNK,
      ]);

      /* Act */
      const result = await convertAsyncIterableToArray(
        pipeUIMessageStream<MyUIMessage>(stream)
          .scan({
            initial: () => ({}),
            reducer: (_state, { chunk }) => {
              if (chunk.type === `text-delta`) {
                /** Emit original plus a marker */
                return [
                  chunk,
                  { type: `text-delta` as const, id: chunk.id, delta: `!` },
                ];
              }
              return chunk;
            },
          })
          .toStream(),
      );

      /* Assert */
      const textDeltas = result.filter((c) => c.type === `text-delta`);
      expect(textDeltas).toEqual([
        { type: `text-delta`, id: `1`, delta: `Hello` },
        { type: `text-delta`, id: `1`, delta: `!` },
        { type: `text-delta`, id: `1`, delta: ` World` },
        { type: `text-delta`, id: `1`, delta: `!` },
      ]);
    });

    it(`should skip emission when returning null`, async () => {
      /* Arrange */
      const stream = convertArrayToReadableStream([
        START_CHUNK,
        ...TEXT_CHUNKS,
        FINISH_CHUNK,
      ]);

      /* Act */
      const result = await convertAsyncIterableToArray(
        pipeUIMessageStream<MyUIMessage>(stream)
          .scan({
            initial: () => ({}),
            reducer: (_state, { chunk }) => {
              /** Skip text-delta chunks */
              if (chunk.type === `text-delta`) {
                return null;
              }
              return chunk;
            },
          })
          .toStream(),
      );

      /* Assert */
      const textDeltas = result.filter((c) => c.type === `text-delta`);
      expect(textDeltas.length).toBe(0);

      /** Other chunks should pass through */
      const textStarts = result.filter((c) => c.type === `text-start`);
      expect(textStarts.length).toBe(1);
    });

    it(`should accept initial state directly instead of factory`, async () => {
      /* Arrange */
      const stream = convertArrayToReadableStream([
        START_CHUNK,
        ...TEXT_CHUNKS,
        FINISH_CHUNK,
      ]);

      /* Act */
      const result = await convertAsyncIterableToArray(
        pipeUIMessageStream<MyUIMessage>(stream)
          .scan({
            initial: { count: 0 },
            reducer: (state, { chunk }) => {
              state.count++;
              if (chunk.type === `text-delta`) {
                return { ...chunk, delta: `[${state.count}] ${chunk.delta}` };
              }
              return chunk;
            },
          })
          .toStream(),
      );

      /* Assert */
      const textDeltas = result.filter((c) => c.type === `text-delta`);
      expect(textDeltas).toEqual([
        { type: `text-delta`, id: `1`, delta: `[2] Hello` },
        { type: `text-delta`, id: `1`, delta: `[3]  World` },
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
          .filter(({ chunk, part }) => part.type !== `reasoning`)
          .map(({ chunk, part }) => chunk)
          .toStream(),
      );

      /* Assert - only text content chunks are returned */
      expect(result).toEqual(TEXT_CONTENT_CHUNKS);
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

  describe(`interleaved chunk handling`, () => {
    it(`should correctly associate chunks when data chunk interleaves tool chunks`, async () => {
      /* Arrange - TOOL_WITH_DATA_CHUNKS has data chunk between tool-input-delta and tool-input-available */
      const stream = convertArrayToReadableStream([
        START_CHUNK,
        ...TOOL_WITH_DATA_CHUNKS,
        FINISH_CHUNK,
      ]);

      const partTypesEncountered: Array<string> = [];

      /* Act */
      const result = await convertAsyncIterableToArray(
        pipeUIMessageStream<MyUIMessage>(stream)
          .map(({ chunk, part }) => {
            partTypesEncountered.push(`${chunk.type}:${part.type}`);
            return chunk;
          })
          .toStream(),
      );

      /* Assert - each chunk should be associated with the correct part type */
      expect(partTypesEncountered).toContain(`tool-input-start:tool-weather`);
      expect(partTypesEncountered).toContain(`tool-input-delta:tool-weather`);
      expect(partTypesEncountered).toContain(`data-weather:data-weather`);
      expect(partTypesEncountered).toContain(
        `tool-input-available:tool-weather`,
      );
      expect(partTypesEncountered).toContain(
        `tool-output-available:tool-weather`,
      );

      /* Verify all tool chunks have part type tool-weather, not data-weather */
      const toolChunksWithWrongPartType = partTypesEncountered.filter(
        (entry) =>
          entry.startsWith(`tool-`) && !entry.endsWith(`:tool-weather`),
      );
      expect(toolChunksWithWrongPartType.length).toBe(0);

      /* Verify all chunks are present in output */
      const toolChunks = result.filter((c) => c.type.startsWith(`tool-`));
      expect(toolChunks.length).toBe(4);

      const dataChunks = result.filter((c) => c.type === `data-weather`);
      expect(dataChunks.length).toBe(1);
    });

    it(`should filter tool chunks correctly when data chunk is interleaved`, async () => {
      /* Arrange */
      const stream = convertArrayToReadableStream([
        START_CHUNK,
        ...TOOL_WITH_DATA_CHUNKS,
        FINISH_CHUNK,
      ]);

      /* Act - filter to only data chunks */
      const result = await convertAsyncIterableToArray(
        pipeUIMessageStream<MyUIMessage>(stream)
          .filter(partType(`data-weather`))
          .toStream(),
      );

      /* Assert - only data chunk should remain */
      expect(result.length).toBe(1);
      expect(result[0]!.type).toBe(`data-weather`);
    });

    it(`should filter data chunks correctly when interleaved with tool chunks`, async () => {
      /* Arrange */
      const stream = convertArrayToReadableStream([
        START_CHUNK,
        ...TOOL_WITH_DATA_CHUNKS,
        FINISH_CHUNK,
      ]);

      /* Act - filter to only tool chunks */
      const result = await convertAsyncIterableToArray(
        pipeUIMessageStream<MyUIMessage>(stream)
          .filter(partType(`tool-weather`))
          .toStream(),
      );

      /* Assert - only tool chunks should remain */
      expect(result.length).toBe(4);
      expect(result.every((c) => c.type.startsWith(`tool-`))).toBe(true);
    });
  });
});
