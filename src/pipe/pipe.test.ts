import { describe, expect, it } from "vitest";
import {
  FINISH_CHUNK,
  FINISH_STEP_CHUNK,
  type MyUIMessage,
  type MyUIMessageChunk,
  REASONING_CHUNKS,
  START_CHUNK,
  START_STEP_CHUNK,
  TEXT_CHUNKS,
  TOOL_WITH_DATA_CHUNKS,
} from "../test/ui-message.js";
import { convertArrayToStream } from "../utils/convert-array-to-stream.js";
import { convertAsyncIterableToArray } from "../utils/convert-async-iterable-to-array.js";
import { pipe } from "./pipe.js";
import { chunkType, includeChunks, includeParts } from "./type-guards.js";

describe(`pipe`, () => {
  describe(`filter`, () => {
    describe(`includeChunks`, () => {
      it(`should filter by single chunk type`, async () => {
        // Arrange
        const stream = convertArrayToStream([START_CHUNK, ...TEXT_CHUNKS, FINISH_CHUNK]);

        // Act
        const result = await convertAsyncIterableToArray(
          pipe<MyUIMessage>(stream).filter(includeChunks(`text-delta`)).toStream(),
        );

        // Assert - only text-delta chunks + meta/step chunks pass through
        expect(result).toEqual([
          START_CHUNK,
          START_STEP_CHUNK,
          { type: `text-delta`, id: `1`, delta: `Hello` },
          { type: `text-delta`, id: `1`, delta: ` World` },
          FINISH_STEP_CHUNK,
          FINISH_CHUNK,
        ]);
      });

      it(`should filter by multiple chunk types`, async () => {
        // Arrange
        const stream = convertArrayToStream([START_CHUNK, ...TEXT_CHUNKS, FINISH_CHUNK]);

        // Act
        const result = await convertAsyncIterableToArray(
          pipe<MyUIMessage>(stream)
            .filter(includeChunks([`text-start`, `text-delta`]))
            .toStream(),
        );

        // Assert - text-start and text-delta chunks + meta/step chunks pass through
        expect(result).toEqual([
          START_CHUNK,
          START_STEP_CHUNK,
          { type: `text-start`, id: `1` },
          { type: `text-delta`, id: `1`, delta: `Hello` },
          { type: `text-delta`, id: `1`, delta: ` World` },
          FINISH_STEP_CHUNK,
          FINISH_CHUNK,
        ]);
      });
    });

    describe(`includeParts`, () => {
      it(`should filter by single part type (meta/step chunks always pass through)`, async () => {
        // Arrange
        const stream = convertArrayToStream([
          START_CHUNK,
          ...TEXT_CHUNKS,
          ...REASONING_CHUNKS,
          FINISH_CHUNK,
        ]);

        // Act
        const result = await convertAsyncIterableToArray(
          pipe<MyUIMessage>(stream).filter(includeParts(`text`)).toStream(),
        );

        // Assert - text content + meta/step chunks (partType: undefined always passes)
        expect(result).toEqual([
          START_CHUNK,
          ...TEXT_CHUNKS,
          START_STEP_CHUNK,
          FINISH_STEP_CHUNK,
          FINISH_CHUNK,
        ]);
      });

      it(`should filter by multiple part types`, async () => {
        // Arrange
        const stream = convertArrayToStream([
          START_CHUNK,
          ...TEXT_CHUNKS,
          ...REASONING_CHUNKS,
          FINISH_CHUNK,
        ]);

        // Act
        const result = await convertAsyncIterableToArray(
          pipe<MyUIMessage>(stream)
            .filter(includeParts([`text`, `reasoning`]))
            .toStream(),
        );

        // Assert - text and reasoning content + meta/step chunks
        expect(result).toEqual([START_CHUNK, ...TEXT_CHUNKS, ...REASONING_CHUNKS, FINISH_CHUNK]);
      });

      it(`should filter tool chunks correctly when data chunk is interleaved`, async () => {
        // Arrange
        const stream = convertArrayToStream([START_CHUNK, ...TOOL_WITH_DATA_CHUNKS, FINISH_CHUNK]);

        // Act - filter to only tool chunks
        const result = await convertAsyncIterableToArray(
          pipe<MyUIMessage>(stream).filter(includeParts(`tool-weather`)).toStream(),
        );

        // Assert - tool chunks + meta/step chunks
        const toolChunks = result.filter((c) => c.type.startsWith(`tool-`));
        expect(toolChunks.length).toBe(4);
        expect(toolChunks.every((c) => c.type.startsWith(`tool-`))).toBe(true);

        // Meta/step chunks also pass through
        expect(result.filter((c) => c.type === `start`).length).toBe(1);
        expect(result.filter((c) => c.type === `finish`).length).toBe(1);
      });

      it(`should filter data chunks correctly when interleaved with tool chunks`, async () => {
        // Arrange
        const stream = convertArrayToStream([START_CHUNK, ...TOOL_WITH_DATA_CHUNKS, FINISH_CHUNK]);

        // Act - filter to only data chunks
        const result = await convertAsyncIterableToArray(
          pipe<MyUIMessage>(stream).filter(includeParts(`data-weather`)).toStream(),
        );

        // Assert - data chunk + meta/step chunks (partType: undefined passes through)
        const dataChunks = result.filter((c) => c.type === `data-weather`);
        expect(dataChunks.length).toBe(1);

        // Meta/step chunks also pass through
        expect(result.filter((c) => c.type === `start`).length).toBe(1);
        expect(result.filter((c) => c.type === `finish`).length).toBe(1);
        expect(result.filter((c) => c.type === `start-step`).length).toBe(1);
        expect(result.filter((c) => c.type === `finish-step`).length).toBe(1);
      });
    });

    describe(`predicate`, () => {
      it(`should filter with plain predicate (meta/step chunks always pass through)`, async () => {
        // Arrange
        const stream = convertArrayToStream([
          START_CHUNK,
          ...TEXT_CHUNKS,
          ...REASONING_CHUNKS,
          FINISH_CHUNK,
        ]);

        // Act
        const result = await convertAsyncIterableToArray(
          pipe<MyUIMessage>(stream)
            .filter(({ part }) => part.type !== `reasoning`)
            .toStream(),
        );

        // Assert - text content + meta/step chunks (reasoning content excluded)
        expect(result).toEqual([
          START_CHUNK,
          ...TEXT_CHUNKS,
          START_STEP_CHUNK,
          FINISH_STEP_CHUNK,
          FINISH_CHUNK,
        ]);
      });

      it(`should chain includeParts with predicate filter`, async () => {
        // Arrange
        const stream = convertArrayToStream([
          START_CHUNK,
          ...TEXT_CHUNKS,
          ...REASONING_CHUNKS,
          FINISH_CHUNK,
        ]);

        // Act
        const result = await convertAsyncIterableToArray(
          pipe<MyUIMessage>(stream)
            .filter(includeParts([`text`, `reasoning`]))
            .filter(({ part }) => part.type !== `reasoning`)
            .toStream(),
        );

        // Assert - text content + meta/step chunks (reasoning content excluded)
        expect(result).toEqual([
          START_CHUNK,
          ...TEXT_CHUNKS,
          START_STEP_CHUNK,
          FINISH_STEP_CHUNK,
          FINISH_CHUNK,
        ]);
      });
    });
  });

  describe(`on`, () => {
    describe(`chunkType`, () => {
      it(`should call callback for matching chunks without filtering`, async () => {
        // Arrange
        const stream = convertArrayToStream([START_CHUNK, ...TEXT_CHUNKS, FINISH_CHUNK]);
        const observed: Array<MyUIMessageChunk> = [];

        // Act
        const result = await convertAsyncIterableToArray(
          pipe<MyUIMessage>(stream)
            .on(chunkType(`text-delta`), ({ chunk }) => {
              observed.push(chunk);
            })
            .toStream(),
        );

        // Assert - all chunks pass through
        expect(result).toEqual([START_CHUNK, ...TEXT_CHUNKS, FINISH_CHUNK]);
        // Assert - only text-delta chunks were observed
        expect(observed.length).toBe(2);
        expect(observed[0]).toEqual({
          type: `text-delta`,
          id: `1`,
          delta: `Hello`,
        });
        expect(observed[1]).toEqual({
          type: `text-delta`,
          id: `1`,
          delta: ` World`,
        });
      });

      it(`should support async callbacks`, async () => {
        // Arrange
        const stream = convertArrayToStream([START_CHUNK, ...TEXT_CHUNKS, FINISH_CHUNK]);
        const observed: Array<string> = [];

        // Act
        await convertAsyncIterableToArray(
          pipe<MyUIMessage>(stream)
            .on(chunkType(`text-delta`), async ({ chunk }) => {
              await new Promise((r) => setTimeout(r, 10));
              observed.push(chunk.delta);
            })
            .toStream(),
        );

        // Assert
        expect(observed).toEqual([`Hello`, ` World`]);
      });

      it(`should propagate callback errors`, async () => {
        // Arrange
        const stream = convertArrayToStream([START_CHUNK, ...TEXT_CHUNKS, FINISH_CHUNK]);

        // Act
        const result = convertAsyncIterableToArray(
          pipe<MyUIMessage>(stream)
            .on(chunkType(`text-delta`), () => {
              throw new Error(`Observer error`);
            })
            .toStream(),
        );

        // Assert
        await expect(result).rejects.toThrow();
      });

      it(`should chain multiple observers`, async () => {
        // Arrange
        const stream = convertArrayToStream([START_CHUNK, ...TEXT_CHUNKS, FINISH_CHUNK]);
        const log1: Array<string> = [];
        const log2: Array<string> = [];

        // Act
        await convertAsyncIterableToArray(
          pipe<MyUIMessage>(stream)
            .on(chunkType(`text-start`), () => {
              log1.push(`start`);
            })
            .on(chunkType(`text-delta`), ({ chunk }) => {
              log2.push(chunk.delta);
            })
            .toStream(),
        );

        // Assert
        expect(log1).toEqual([`start`]);
        expect(log2).toEqual([`Hello`, ` World`]);
      });

      it(`should observe meta chunks`, async () => {
        // Arrange
        const stream = convertArrayToStream([START_CHUNK, ...TEXT_CHUNKS, FINISH_CHUNK]);
        const observed: Array<string> = [];

        // Act
        await convertAsyncIterableToArray(
          pipe<MyUIMessage>(stream)
            .on(chunkType(`start`), () => {
              observed.push(`start`);
            })
            .on(chunkType(`finish`), () => {
              observed.push(`finish`);
            })
            .toStream(),
        );

        // Assert
        expect(observed).toEqual([`start`, `finish`]);
      });
    });

    describe(`predicate`, () => {
      it(`should work with generic predicate`, async () => {
        // Arrange
        const stream = convertArrayToStream([START_CHUNK, ...TEXT_CHUNKS, FINISH_CHUNK]);
        const observed: Array<MyUIMessageChunk> = [];

        // Act
        await convertAsyncIterableToArray(
          pipe<MyUIMessage>(stream)
            .on(
              ({ chunk }) => chunk.type.startsWith(`text-`),
              ({ chunk }) => {
                observed.push(chunk);
              },
            )
            .toStream(),
        );

        // Assert - text-start, text-delta x2, text-end
        expect(observed.length).toBe(4);
      });
    });
  });

  describe(`map`, () => {
    it(`should apply single map operation`, async () => {
      // Arrange
      const stream = convertArrayToStream([START_CHUNK, ...TEXT_CHUNKS, FINISH_CHUNK]);

      // Act
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

      // Assert
      const textDeltas = result.filter((c) => c.type === `text-delta`);
      expect(textDeltas).toEqual([
        { type: `text-delta`, id: `1`, delta: `HELLO` },
        { type: `text-delta`, id: `1`, delta: ` WORLD` },
      ]);
    });
  });

  describe(`chained`, () => {
    it(`should apply multiple filter operations`, async () => {
      // Arrange
      const stream = convertArrayToStream([
        START_CHUNK,
        ...TEXT_CHUNKS,
        ...REASONING_CHUNKS,
        FINISH_CHUNK,
      ]);

      // Act
      const result = await convertAsyncIterableToArray(
        pipe<MyUIMessage>(stream)
          .filter(includeParts([`text`, `reasoning`]))
          .filter(({ part }) => part.type !== `reasoning`)
          .map(({ chunk }) => chunk)
          .toStream(),
      );

      // Assert - text content + meta/step chunks (reasoning content excluded)
      expect(result).toEqual([
        START_CHUNK,
        ...TEXT_CHUNKS,
        START_STEP_CHUNK,
        FINISH_STEP_CHUNK,
        FINISH_CHUNK,
      ]);
    });

    it(`should apply filter then map`, async () => {
      // Arrange
      const stream = convertArrayToStream([
        START_CHUNK,
        ...TEXT_CHUNKS,
        ...REASONING_CHUNKS,
        FINISH_CHUNK,
      ]);

      // Act
      const result = await convertAsyncIterableToArray(
        pipe<MyUIMessage>(stream)
          .filter(includeParts(`text`))
          .map(({ chunk }) => {
            if (chunk.type === `text-delta`) {
              return { ...chunk, delta: chunk.delta.toUpperCase() };
            }
            return chunk;
          })
          .toStream(),
      );

      // Assert
      const textDeltas = result.filter((c) => c.type === `text-delta`);
      expect(textDeltas).toEqual([
        { type: `text-delta`, id: `1`, delta: `HELLO` },
        { type: `text-delta`, id: `1`, delta: ` WORLD` },
      ]);
    });

    it(`should apply map then filter`, async () => {
      // Arrange
      const stream = convertArrayToStream([
        START_CHUNK,
        ...TEXT_CHUNKS,
        ...REASONING_CHUNKS,
        FINISH_CHUNK,
      ]);

      // Act
      const result = await convertAsyncIterableToArray(
        pipe<MyUIMessage>(stream)
          .map(({ chunk }) => {
            if (chunk.type === `text-delta`) {
              return { ...chunk, delta: chunk.delta.toUpperCase() };
            }
            return chunk;
          })
          .filter(includeParts(`text`))
          .toStream(),
      );

      // Assert
      const textDeltas = result.filter((c) => c.type === `text-delta`);
      expect(textDeltas).toEqual([
        { type: `text-delta`, id: `1`, delta: `HELLO` },
        { type: `text-delta`, id: `1`, delta: ` WORLD` },
      ]);
    });
  });

  describe(`interleaved`, () => {
    it(`should correctly associate chunks when data chunk interleaves tool chunks`, async () => {
      // Arrange - TOOL_WITH_DATA_CHUNKS has data chunk between tool-input-delta and tool-input-available
      const stream = convertArrayToStream([START_CHUNK, ...TOOL_WITH_DATA_CHUNKS, FINISH_CHUNK]);

      const partTypesEncountered: Array<string> = [];

      // Act
      const result = await convertAsyncIterableToArray(
        pipe<MyUIMessage>(stream)
          .map(({ chunk, part }) => {
            partTypesEncountered.push(`${chunk.type}:${part.type}`);
            return chunk;
          })
          .toStream(),
      );

      // Assert - each chunk should be associated with the correct part type
      expect(partTypesEncountered).toContain(`tool-input-start:tool-weather`);
      expect(partTypesEncountered).toContain(`tool-input-delta:tool-weather`);
      expect(partTypesEncountered).toContain(`data-weather:data-weather`);
      expect(partTypesEncountered).toContain(`tool-input-available:tool-weather`);
      expect(partTypesEncountered).toContain(`tool-output-available:tool-weather`);

      // Verify all tool chunks have part type tool-weather, not data-weather
      const toolChunksWithWrongPartType = partTypesEncountered.filter(
        (entry) => entry.startsWith(`tool-`) && !entry.endsWith(`:tool-weather`),
      );
      expect(toolChunksWithWrongPartType.length).toBe(0);

      // Verify all chunks are present in output
      const toolChunks = result.filter((c) => c.type.startsWith(`tool-`));
      expect(toolChunks.length).toBe(4);

      const dataChunks = result.filter((c) => c.type === `data-weather`);
      expect(dataChunks.length).toBe(1);
    });
  });

  describe(`consumed`, () => {
    it(`should throw error when toStream is called twice`, async () => {
      // Arrange
      const stream = convertArrayToStream([START_CHUNK, ...TEXT_CHUNKS, FINISH_CHUNK]);
      const pipeline = pipe<MyUIMessage>(stream).filter(includeParts(`text`));

      // Act
      pipeline.toStream();
      const result = () => pipeline.toStream();

      // Assert
      expect(result).toThrow();
    });

    it(`should throw error when iterating twice`, async () => {
      // Arrange
      const stream = convertArrayToStream([START_CHUNK, ...TEXT_CHUNKS, FINISH_CHUNK]);
      const pipeline = pipe<MyUIMessage>(stream).filter(includeParts(`text`));

      // Act
      await convertAsyncIterableToArray(pipeline);
      const result = convertAsyncIterableToArray(pipeline);

      // Assert
      await expect(result).rejects.toThrow();
    });

    it(`should throw error when toStream called after iteration`, async () => {
      // Arrange
      const stream = convertArrayToStream([START_CHUNK, ...TEXT_CHUNKS, FINISH_CHUNK]);
      const pipeline = pipe<MyUIMessage>(stream).filter(includeParts(`text`));

      // Act
      await convertAsyncIterableToArray(pipeline);
      const result = () => pipeline.toStream();

      // Assert
      expect(result).toThrow();
    });
  });
});
