import { describe, expect, it } from "vitest";
import { convertArrayToStream } from "../utils/convert-array-to-stream.js";
import { convertAsyncIterableToArray } from "../utils/convert-async-iterable-to-array.js";
import {
  FINISH_CHUNK,
  FINISH_STEP_CHUNK,
  type MyUIMessage,
  REASONING_CHUNKS,
  START_CHUNK,
  START_STEP_CHUNK,
  TEXT_CHUNKS,
  TOOL_WITH_DATA_CHUNKS,
} from "../test/ui-message.js";
import { excludeParts, includeParts } from "../filter/filter-ui-message-stream.js";
import { isPartType } from "./part-type.js";
import { pipe } from "./pipe.js";

describe(`pipe`, () => {
  describe(`empty pipeline`, () => {
    it(`should pass through all chunks including meta and step boundaries`, async () => {
      /* Arrange */
      const stream = convertArrayToStream([START_CHUNK, ...TEXT_CHUNKS, FINISH_CHUNK]);

      /* Act */
      const result = await convertAsyncIterableToArray(pipe<MyUIMessage>(stream).toStream());

      /* Assert - all chunks pass through (meta, step boundaries, and content) */
      expect(result).toEqual([START_CHUNK, ...TEXT_CHUNKS, FINISH_CHUNK]);
    });
  });

  describe(`filter`, () => {
    it(`should apply includeParts filter (meta/step chunks always pass through)`, async () => {
      /* Arrange */
      const stream = convertArrayToStream([
        START_CHUNK,
        ...TEXT_CHUNKS,
        ...REASONING_CHUNKS,
        FINISH_CHUNK,
      ]);

      /* Act */
      const result = await convertAsyncIterableToArray(
        pipe<MyUIMessage>(stream)
          .filter(includeParts([`text`]))
          .toStream(),
      );

      /* Assert - text content + meta/step chunks (partType: undefined always passes) */
      expect(result).toEqual([
        START_CHUNK,
        ...TEXT_CHUNKS,
        START_STEP_CHUNK /* from REASONING_CHUNKS */,
        FINISH_STEP_CHUNK /* from REASONING_CHUNKS */,
        FINISH_CHUNK,
      ]);
    });

    it(`should apply excludeParts filter (meta/step chunks always pass through)`, async () => {
      /* Arrange */
      const stream = convertArrayToStream([
        START_CHUNK,
        ...TEXT_CHUNKS,
        ...REASONING_CHUNKS,
        FINISH_CHUNK,
      ]);

      /* Act */
      const result = await convertAsyncIterableToArray(
        pipe<MyUIMessage>(stream)
          .filter(excludeParts([`reasoning`]))
          .toStream(),
      );

      /* Assert - text + meta/step chunks (reasoning content excluded) */
      expect(result).toEqual([
        START_CHUNK,
        ...TEXT_CHUNKS,
        START_STEP_CHUNK /* from REASONING_CHUNKS */,
        FINISH_STEP_CHUNK /* from REASONING_CHUNKS */,
        FINISH_CHUNK,
      ]);
    });

    it(`should apply includeParts and excludeParts combined`, async () => {
      /* Arrange */
      const stream = convertArrayToStream([
        START_CHUNK,
        ...TEXT_CHUNKS,
        ...REASONING_CHUNKS,
        FINISH_CHUNK,
      ]);

      /* Act */
      const result = await convertAsyncIterableToArray(
        pipe<MyUIMessage>(stream)
          .filter(includeParts([`text`, `reasoning`]))
          .filter(excludeParts([`reasoning`]))
          .toStream(),
      );

      /* Assert - text content + meta/step chunks (reasoning content excluded) */
      expect(result).toEqual([
        START_CHUNK,
        ...TEXT_CHUNKS,
        START_STEP_CHUNK /* from REASONING_CHUNKS */,
        FINISH_STEP_CHUNK /* from REASONING_CHUNKS */,
        FINISH_CHUNK,
      ]);
    });
  });

  describe(`map`, () => {
    it(`should apply single map operation`, async () => {
      /* Arrange */
      const stream = convertArrayToStream([START_CHUNK, ...TEXT_CHUNKS, FINISH_CHUNK]);

      /* Act */
      const result = await convertAsyncIterableToArray(
        pipe<MyUIMessage>(stream)
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

  // describe(`scan`, () => {
  //   it(`should accumulate state across chunks`, async () => {
  //     /* Arrange */
  //     const stream = convertArrayToStream([START_CHUNK, ...TEXT_CHUNKS, FINISH_CHUNK]);

  //     /* Act */
  //     const result = await convertAsyncIterableToArray(
  //       pipe<MyUIMessage>(stream)
  //         .scan({
  //           initial: () => ({ count: 0 }),
  //           reducer: (state, { chunk }) => {
  //             state.count++;
  //             if (chunk.type === `text-delta`) {
  //               return { ...chunk, delta: `[${state.count}] ${chunk.delta}` };
  //             }
  //             return chunk;
  //           },
  //         })
  //         .toStream(),
  //     );

  //     /* Assert */
  //     const textDeltas = result.filter((c) => c.type === `text-delta`);
  //     expect(textDeltas).toEqual([
  //       { type: `text-delta`, id: `1`, delta: `[2] Hello` },
  //       { type: `text-delta`, id: `1`, delta: `[3]  World` },
  //     ]);
  //   });

  //   it(`should call finalize at stream end`, async () => {
  //     /* Arrange */
  //     const stream = convertArrayToStream([START_CHUNK, ...TEXT_CHUNKS, FINISH_CHUNK]);

  //     /* Act */
  //     const result = await convertAsyncIterableToArray(
  //       pipe<MyUIMessage>(stream)
  //         .scan({
  //           initial: () => ({ buffer: `` }),
  //           reducer: (state, { chunk }) => {
  //             if (chunk.type === `text-delta`) {
  //               state.buffer += chunk.delta;
  //               return null; /** Don't emit yet */
  //             }
  //             return chunk;
  //           },
  //           finalize: (state) => {
  //             /** Emit buffered content at end */
  //             if (state.buffer) {
  //               return {
  //                 type: `text-delta` as const,
  //                 id: `1`,
  //                 delta: state.buffer,
  //               };
  //             }
  //             return null;
  //           },
  //         })
  //         .toStream(),
  //     );

  //     /* Assert */
  //     const textDeltas = result.filter((c) => c.type === `text-delta`);
  //     expect(textDeltas.length).toBe(1);
  //     expect(textDeltas[0]).toEqual({
  //       type: `text-delta`,
  //       id: `1`,
  //       delta: `Hello World`,
  //     });
  //   });

  //   it(`should emit multiple chunks from step function`, async () => {
  //     /* Arrange */
  //     const stream = convertArrayToStream([START_CHUNK, ...TEXT_CHUNKS, FINISH_CHUNK]);

  //     /* Act */
  //     const result = await convertAsyncIterableToArray(
  //       pipe<MyUIMessage>(stream)
  //         .scan({
  //           initial: () => ({}),
  //           reducer: (_state, { chunk }) => {
  //             if (chunk.type === `text-delta`) {
  //               /** Emit original plus a marker */
  //               return [chunk, { type: `text-delta` as const, id: chunk.id, delta: `!` }];
  //             }
  //             return chunk;
  //           },
  //         })
  //         .toStream(),
  //     );

  //     /* Assert */
  //     const textDeltas = result.filter((c) => c.type === `text-delta`);
  //     expect(textDeltas).toEqual([
  //       { type: `text-delta`, id: `1`, delta: `Hello` },
  //       { type: `text-delta`, id: `1`, delta: `!` },
  //       { type: `text-delta`, id: `1`, delta: ` World` },
  //       { type: `text-delta`, id: `1`, delta: `!` },
  //     ]);
  //   });

  //   it(`should skip emission when returning null`, async () => {
  //     /* Arrange */
  //     const stream = convertArrayToStream([START_CHUNK, ...TEXT_CHUNKS, FINISH_CHUNK]);

  //     /* Act */
  //     const result = await convertAsyncIterableToArray(
  //       pipe<MyUIMessage>(stream)
  //         .scan({
  //           initial: () => ({}),
  //           reducer: (_state, { chunk }) => {
  //             /** Skip text-delta chunks */
  //             if (chunk.type === `text-delta`) {
  //               return null;
  //             }
  //             return chunk;
  //           },
  //         })
  //         .toStream(),
  //     );

  //     /* Assert */
  //     const textDeltas = result.filter((c) => c.type === `text-delta`);
  //     expect(textDeltas.length).toBe(0);

  //     /** Other chunks should pass through */
  //     const textStarts = result.filter((c) => c.type === `text-start`);
  //     expect(textStarts.length).toBe(1);
  //   });

  //   it(`should accept initial state directly instead of factory`, async () => {
  //     /* Arrange */
  //     const stream = convertArrayToStream([START_CHUNK, ...TEXT_CHUNKS, FINISH_CHUNK]);

  //     /* Act */
  //     const result = await convertAsyncIterableToArray(
  //       pipe<MyUIMessage>(stream)
  //         .scan({
  //           initial: { count: 0 },
  //           reducer: (state, { chunk }) => {
  //             state.count++;
  //             if (chunk.type === `text-delta`) {
  //               return { ...chunk, delta: `[${state.count}] ${chunk.delta}` };
  //             }
  //             return chunk;
  //           },
  //         })
  //         .toStream(),
  //     );

  //     /* Assert */
  //     const textDeltas = result.filter((c) => c.type === `text-delta`);
  //     expect(textDeltas).toEqual([
  //       { type: `text-delta`, id: `1`, delta: `[2] Hello` },
  //       { type: `text-delta`, id: `1`, delta: `[3]  World` },
  //     ]);
  //   });
  // });

  describe(`chained operations`, () => {
    it(`should apply multiple filter operations`, async () => {
      /* Arrange */
      const stream = convertArrayToStream([
        START_CHUNK,
        ...TEXT_CHUNKS,
        ...REASONING_CHUNKS,
        FINISH_CHUNK,
      ]);

      /* Act */
      const result = await convertAsyncIterableToArray(
        pipe<MyUIMessage>(stream)
          .filter(includeParts([`text`, `reasoning`]))
          .filter(({ chunk, part }) => part.type !== `reasoning`)
          .map(({ chunk, part }) => chunk)
          .toStream(),
      );

      /* Assert - text content + meta/step chunks (reasoning content excluded) */
      expect(result).toEqual([
        START_CHUNK,
        ...TEXT_CHUNKS,
        START_STEP_CHUNK /* from REASONING_CHUNKS */,
        FINISH_STEP_CHUNK /* from REASONING_CHUNKS */,
        FINISH_CHUNK,
      ]);
    });

    it(`should apply filter then map`, async () => {
      /* Arrange */
      const stream = convertArrayToStream([
        START_CHUNK,
        ...TEXT_CHUNKS,
        ...REASONING_CHUNKS,
        FINISH_CHUNK,
      ]);

      /* Act */
      const result = await convertAsyncIterableToArray(
        pipe<MyUIMessage>(stream)
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
      const stream = convertArrayToStream([
        START_CHUNK,
        ...TEXT_CHUNKS,
        ...REASONING_CHUNKS,
        FINISH_CHUNK,
      ]);

      /* Act */
      const result = await convertAsyncIterableToArray(
        pipe<MyUIMessage>(stream)
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
      const stream = convertArrayToStream([START_CHUNK, ...TEXT_CHUNKS, FINISH_CHUNK]);
      const pipeline = pipe<MyUIMessage>(stream).filter(includeParts([`text`]));

      /* Act */
      pipeline.toStream();
      const result = () => pipeline.toStream();

      /* Assert */
      expect(result).toThrow();
    });

    it(`should throw error when iterating twice`, async () => {
      /* Arrange */
      const stream = convertArrayToStream([START_CHUNK, ...TEXT_CHUNKS, FINISH_CHUNK]);
      const pipeline = pipe<MyUIMessage>(stream).filter(includeParts([`text`]));

      /* Act */
      await convertAsyncIterableToArray(pipeline);
      const result = convertAsyncIterableToArray(pipeline);

      /* Assert */
      await expect(result).rejects.toThrow();
    });

    it(`should throw error when toStream called after iteration`, async () => {
      /* Arrange */
      const stream = convertArrayToStream([START_CHUNK, ...TEXT_CHUNKS, FINISH_CHUNK]);
      const pipeline = pipe<MyUIMessage>(stream).filter(includeParts([`text`]));

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
      const stream = convertArrayToStream([START_CHUNK, ...TOOL_WITH_DATA_CHUNKS, FINISH_CHUNK]);

      const partTypesEncountered: Array<string> = [];

      /* Act */
      const result = await convertAsyncIterableToArray(
        pipe<MyUIMessage>(stream)
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
      expect(partTypesEncountered).toContain(`tool-input-available:tool-weather`);
      expect(partTypesEncountered).toContain(`tool-output-available:tool-weather`);

      /* Verify all tool chunks have part type tool-weather, not data-weather */
      const toolChunksWithWrongPartType = partTypesEncountered.filter(
        (entry) => entry.startsWith(`tool-`) && !entry.endsWith(`:tool-weather`),
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
      const stream = convertArrayToStream([START_CHUNK, ...TOOL_WITH_DATA_CHUNKS, FINISH_CHUNK]);

      /* Act - filter to only data chunks */
      const result = await convertAsyncIterableToArray(
        pipe<MyUIMessage>(stream).filter(isPartType(`data-weather`)).toStream(),
      );

      /* Assert - data chunk + meta/step chunks (partType: undefined passes through) */
      const dataChunks = result.filter((c) => c.type === `data-weather`);
      expect(dataChunks.length).toBe(1);

      /* Meta/step chunks also pass through */
      expect(result.filter((c) => c.type === `start`).length).toBe(1);
      expect(result.filter((c) => c.type === `finish`).length).toBe(1);
      expect(result.filter((c) => c.type === `start-step`).length).toBe(1);
      expect(result.filter((c) => c.type === `finish-step`).length).toBe(1);
    });

    it(`should filter data chunks correctly when interleaved with tool chunks`, async () => {
      /* Arrange */
      const stream = convertArrayToStream([START_CHUNK, ...TOOL_WITH_DATA_CHUNKS, FINISH_CHUNK]);

      /* Act - filter to only tool chunks */
      const result = await convertAsyncIterableToArray(
        pipe<MyUIMessage>(stream).filter(isPartType(`tool-weather`)).toStream(),
      );

      /* Assert - tool chunks + meta/step chunks */
      const toolChunks = result.filter((c) => c.type.startsWith(`tool-`));
      expect(toolChunks.length).toBe(4);
      expect(toolChunks.every((c) => c.type.startsWith(`tool-`))).toBe(true);

      /* Meta/step chunks also pass through */
      expect(result.filter((c) => c.type === `start`).length).toBe(1);
      expect(result.filter((c) => c.type === `finish`).length).toBe(1);
    });
  });
});
