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
import { convertArrayToAsyncIterable } from "../utils/convert-array-to-async-iterable.js";
import { convertArrayToStream } from "../utils/convert-array-to-stream.js";
import { convertAsyncIterableToArray } from "../utils/convert-async-iterable-to-array.js";
import { createAsyncIterableStream } from "../utils/create-async-iterable-stream.js";
import { pipe } from "./pipe.js";
import {
  chunkType,
  excludeChunks,
  excludeParts,
  includeChunks,
  includeParts,
  partType,
} from "./type-guards.js";

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

        // Assert - text-start and text-end chunks are excluded
        const textStartChunks = result.filter((c) => c.type === `text-start`);
        const textEndChunks = result.filter((c) => c.type === `text-end`);
        expect(textStartChunks.length).toBe(0);
        expect(textEndChunks.length).toBe(0);
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

        // Assert - text-end chunks are excluded
        const textEndChunks = result.filter((c) => c.type === `text-end`);
        expect(textEndChunks.length).toBe(0);
      });

      it(`should chain multiple filters`, async () => {
        // Arrange
        const stream = convertArrayToStream([START_CHUNK, ...TEXT_CHUNKS, FINISH_CHUNK]);

        // Act - first filter to text-start+text-delta, then narrow to just text-delta
        const result = await convertAsyncIterableToArray(
          pipe<MyUIMessage>(stream)
            .filter(includeChunks([`text-start`, `text-delta`]))
            .filter(includeChunks(`text-delta`))
            .toStream(),
        );

        // Assert - only text-delta + meta/step chunks pass
        expect(result).toEqual([
          START_CHUNK,
          START_STEP_CHUNK,
          { type: `text-delta`, id: `1`, delta: `Hello` },
          { type: `text-delta`, id: `1`, delta: ` World` },
          FINISH_STEP_CHUNK,
          FINISH_CHUNK,
        ]);

        // Assert - text-start and text-end are excluded
        const textStartChunks = result.filter((c) => c.type === `text-start`);
        const textEndChunks = result.filter((c) => c.type === `text-end`);
        expect(textStartChunks.length).toBe(0);
        expect(textEndChunks.length).toBe(0);
      });
    });

    describe(`excludeChunks`, () => {
      it(`should filter by single chunk type`, async () => {
        // Arrange
        const stream = convertArrayToStream([START_CHUNK, ...TEXT_CHUNKS, FINISH_CHUNK]);

        // Act
        const result = await convertAsyncIterableToArray(
          pipe<MyUIMessage>(stream).filter(excludeChunks(`text-delta`)).toStream(),
        );

        // Assert - text-start and text-end chunks + meta/step chunks pass through
        expect(result).toEqual([
          START_CHUNK,
          START_STEP_CHUNK,
          { type: `text-start`, id: `1` },
          { type: `text-end`, id: `1` },
          FINISH_STEP_CHUNK,
          FINISH_CHUNK,
        ]);

        // Assert - text-delta chunks are excluded
        const textDeltaChunks = result.filter((c) => c.type === `text-delta`);
        expect(textDeltaChunks.length).toBe(0);
      });

      it(`should filter by multiple chunk types`, async () => {
        // Arrange
        const stream = convertArrayToStream([START_CHUNK, ...TEXT_CHUNKS, FINISH_CHUNK]);

        // Act
        const result = await convertAsyncIterableToArray(
          pipe<MyUIMessage>(stream)
            .filter(excludeChunks([`text-start`, `text-delta`]))
            .toStream(),
        );

        // Assert - only text-end + meta/step chunks pass through
        expect(result).toEqual([
          START_CHUNK,
          START_STEP_CHUNK,
          { type: `text-end`, id: `1` },
          FINISH_STEP_CHUNK,
          FINISH_CHUNK,
        ]);

        // Assert - text-start and text-delta chunks are excluded
        const textStartChunks = result.filter((c) => c.type === `text-start`);
        const textDeltaChunks = result.filter((c) => c.type === `text-delta`);
        expect(textStartChunks.length).toBe(0);
        expect(textDeltaChunks.length).toBe(0);
      });

      it(`should chain multiple filters`, async () => {
        // Arrange
        const stream = convertArrayToStream([START_CHUNK, ...TEXT_CHUNKS, FINISH_CHUNK]);

        // Act - exclude text-start, then exclude text-delta
        const result = await convertAsyncIterableToArray(
          pipe<MyUIMessage>(stream)
            .filter(excludeChunks(`text-start`))
            .filter(excludeChunks(`text-delta`))
            .toStream(),
        );

        // Assert - only text-end + meta/step chunks pass through
        expect(result).toEqual([
          START_CHUNK,
          START_STEP_CHUNK,
          { type: `text-end`, id: `1` },
          FINISH_STEP_CHUNK,
          FINISH_CHUNK,
        ]);

        // Assert - text-start and text-delta chunks are excluded
        const textStartChunks = result.filter((c) => c.type === `text-start`);
        const textDeltaChunks = result.filter((c) => c.type === `text-delta`);
        expect(textStartChunks.length).toBe(0);
        expect(textDeltaChunks.length).toBe(0);
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

        // Assert - reasoning chunks are excluded
        const reasoningChunks = result.filter((c) => c.type.startsWith(`reasoning-`));
        expect(reasoningChunks.length).toBe(0);
      });

      it(`should filter by multiple part types`, async () => {
        // Arrange
        const stream = convertArrayToStream([
          START_CHUNK,
          ...TEXT_CHUNKS,
          ...REASONING_CHUNKS,
          ...TOOL_WITH_DATA_CHUNKS,
          FINISH_CHUNK,
        ]);

        // Act
        const result = await convertAsyncIterableToArray(
          pipe<MyUIMessage>(stream)
            .filter(includeParts([`text`, `reasoning`]))
            .toStream(),
        );

        // Assert - text and reasoning content + meta/step chunks
        expect(result).toEqual([
          START_CHUNK,
          ...TEXT_CHUNKS,
          ...REASONING_CHUNKS,
          START_STEP_CHUNK,
          FINISH_STEP_CHUNK,
          FINISH_CHUNK,
        ]);

        // Assert - tool and data chunks are excluded
        const toolChunks = result.filter((c) => c.type.startsWith(`tool-`));
        const dataChunks = result.filter((c) => c.type === `data-weather`);
        expect(toolChunks.length).toBe(0);
        expect(dataChunks.length).toBe(0);
      });

      it(`should filter tool chunks correctly when data chunk is interleaved`, async () => {
        // Arrange
        const stream = convertArrayToStream([
          START_CHUNK,
          ...TEXT_CHUNKS,
          ...REASONING_CHUNKS,
          ...TOOL_WITH_DATA_CHUNKS,
          FINISH_CHUNK,
        ]);

        // Act - filter to only tool chunks
        const result = await convertAsyncIterableToArray(
          pipe<MyUIMessage>(stream).filter(includeParts(`tool-weather`)).toStream(),
        );

        // Assert - tool chunks + meta/step chunks
        const toolChunks = result.filter((c) => c.type.startsWith(`tool-`));
        expect(toolChunks.length).toBe(4);
        expect(toolChunks.every((c) => c.type.startsWith(`tool-`))).toBe(true);

        // Assert - meta/step chunks pass through
        const startChunks = result.filter((c) => c.type === `start`);
        const finishChunks = result.filter((c) => c.type === `finish`);
        expect(startChunks.length).toBe(1);
        expect(finishChunks.length).toBe(1);

        // Assert - text, reasoning, and data chunks are excluded
        const textChunks = result.filter((c) => c.type.startsWith(`text-`));
        const reasoningChunks = result.filter((c) => c.type.startsWith(`reasoning-`));
        const dataChunks = result.filter((c) => c.type === `data-weather`);
        expect(textChunks.length).toBe(0);
        expect(reasoningChunks.length).toBe(0);
        expect(dataChunks.length).toBe(0);
      });

      it(`should filter data chunks correctly when interleaved with tool chunks`, async () => {
        // Arrange
        const stream = convertArrayToStream([
          START_CHUNK,
          ...TEXT_CHUNKS,
          ...REASONING_CHUNKS,
          ...TOOL_WITH_DATA_CHUNKS,
          FINISH_CHUNK,
        ]);

        // Act - filter to only data chunks
        const result = await convertAsyncIterableToArray(
          pipe<MyUIMessage>(stream).filter(includeParts(`data-weather`)).toStream(),
        );

        // Assert - data chunk + meta/step chunks (partType: undefined passes through)
        const dataChunks = result.filter((c) => c.type === `data-weather`);
        expect(dataChunks.length).toBe(1);

        // Assert - meta/step chunks pass through
        const startChunks = result.filter((c) => c.type === `start`);
        const finishChunks = result.filter((c) => c.type === `finish`);
        expect(startChunks.length).toBe(1);
        expect(finishChunks.length).toBe(1);

        // Assert - text, reasoning, and tool chunks are excluded
        const textChunks = result.filter((c) => c.type.startsWith(`text-`));
        const reasoningChunks = result.filter((c) => c.type.startsWith(`reasoning-`));
        const toolChunks = result.filter((c) => c.type.startsWith(`tool-`));
        expect(textChunks.length).toBe(0);
        expect(reasoningChunks.length).toBe(0);
        expect(toolChunks.length).toBe(0);
      });

      it(`should chain multiple filters`, async () => {
        // Arrange
        const stream = convertArrayToStream([
          START_CHUNK,
          ...TEXT_CHUNKS,
          ...REASONING_CHUNKS,
          FINISH_CHUNK,
        ]);

        // Act - first filter to text+reasoning, then narrow to just text
        const result = await convertAsyncIterableToArray(
          pipe<MyUIMessage>(stream)
            .filter(includeParts([`text`, `reasoning`]))
            .filter(includeParts(`text`))
            .toStream(),
        );

        // Assert - text content + meta/step chunks
        expect(result).toEqual([
          START_CHUNK,
          ...TEXT_CHUNKS,
          START_STEP_CHUNK,
          FINISH_STEP_CHUNK,
          FINISH_CHUNK,
        ]);

        // Assert - reasoning chunks are excluded
        const reasoningChunks = result.filter((c) => c.type.startsWith(`reasoning-`));
        expect(reasoningChunks.length).toBe(0);
      });
    });

    describe(`excludeParts`, () => {
      it(`should filter by single part type`, async () => {
        // Arrange
        const stream = convertArrayToStream([
          START_CHUNK,
          ...TEXT_CHUNKS,
          ...REASONING_CHUNKS,
          FINISH_CHUNK,
        ]);

        // Act
        const result = await convertAsyncIterableToArray(
          pipe<MyUIMessage>(stream).filter(excludeParts(`reasoning`)).toStream(),
        );

        // Assert - text content + meta/step chunks pass through
        expect(result).toEqual([
          START_CHUNK,
          ...TEXT_CHUNKS,
          START_STEP_CHUNK,
          FINISH_STEP_CHUNK,
          FINISH_CHUNK,
        ]);

        // Assert - reasoning chunks are excluded
        const reasoningChunks = result.filter((c) => c.type.startsWith(`reasoning-`));
        expect(reasoningChunks.length).toBe(0);
      });

      it(`should filter by multiple part types`, async () => {
        // Arrange
        const stream = convertArrayToStream([
          START_CHUNK,
          ...TEXT_CHUNKS,
          ...REASONING_CHUNKS,
          ...TOOL_WITH_DATA_CHUNKS,
          FINISH_CHUNK,
        ]);

        // Act
        const result = await convertAsyncIterableToArray(
          pipe<MyUIMessage>(stream)
            .filter(excludeParts([`text`, `reasoning`]))
            .toStream(),
        );

        // Assert - tool and data chunks + meta/step chunks pass through
        const toolChunks = result.filter((c) => c.type.startsWith(`tool-`));
        const dataChunks = result.filter((c) => c.type === `data-weather`);
        expect(toolChunks.length).toBe(4);
        expect(dataChunks.length).toBe(1);

        // Assert - text and reasoning chunks are excluded
        const textChunks = result.filter((c) => c.type.startsWith(`text-`));
        const reasoningChunks = result.filter((c) => c.type.startsWith(`reasoning-`));
        expect(textChunks.length).toBe(0);
        expect(reasoningChunks.length).toBe(0);
      });

      it(`should filter tool chunks correctly`, async () => {
        // Arrange
        const stream = convertArrayToStream([
          START_CHUNK,
          ...TEXT_CHUNKS,
          ...REASONING_CHUNKS,
          ...TOOL_WITH_DATA_CHUNKS,
          FINISH_CHUNK,
        ]);

        // Act - exclude tool chunks
        const result = await convertAsyncIterableToArray(
          pipe<MyUIMessage>(stream).filter(excludeParts(`tool-weather`)).toStream(),
        );

        // Assert - text, reasoning, and data chunks + meta/step chunks pass through
        const textChunks = result.filter((c) => c.type.startsWith(`text-`));
        const reasoningChunks = result.filter((c) => c.type.startsWith(`reasoning-`));
        const dataChunks = result.filter((c) => c.type === `data-weather`);
        expect(textChunks.length).toBe(4);
        expect(reasoningChunks.length).toBe(4);
        expect(dataChunks.length).toBe(1);

        // Assert - tool chunks are excluded
        const toolChunks = result.filter((c) => c.type.startsWith(`tool-`));
        expect(toolChunks.length).toBe(0);
      });

      it(`should filter data chunks correctly`, async () => {
        // Arrange
        const stream = convertArrayToStream([
          START_CHUNK,
          ...TEXT_CHUNKS,
          ...REASONING_CHUNKS,
          ...TOOL_WITH_DATA_CHUNKS,
          FINISH_CHUNK,
        ]);

        // Act - exclude data chunks
        const result = await convertAsyncIterableToArray(
          pipe<MyUIMessage>(stream).filter(excludeParts(`data-weather`)).toStream(),
        );

        // Assert - text, reasoning, and tool chunks + meta/step chunks pass through
        const textChunks = result.filter((c) => c.type.startsWith(`text-`));
        const reasoningChunks = result.filter((c) => c.type.startsWith(`reasoning-`));
        const toolChunks = result.filter((c) => c.type.startsWith(`tool-`));
        expect(textChunks.length).toBe(4);
        expect(reasoningChunks.length).toBe(4);
        expect(toolChunks.length).toBe(4);

        // Assert - data chunks are excluded
        const dataChunks = result.filter((c) => c.type === `data-weather`);
        expect(dataChunks.length).toBe(0);
      });

      it(`should chain multiple filters`, async () => {
        // Arrange
        const stream = convertArrayToStream([
          START_CHUNK,
          ...TEXT_CHUNKS,
          ...REASONING_CHUNKS,
          FINISH_CHUNK,
        ]);

        // Act - exclude text, then exclude reasoning
        const result = await convertAsyncIterableToArray(
          pipe<MyUIMessage>(stream)
            .filter(excludeParts(`text`))
            .filter(excludeParts(`reasoning`))
            .toStream(),
        );

        // Assert - only meta/step chunks pass through
        expect(result).toEqual([
          START_CHUNK,
          START_STEP_CHUNK,
          FINISH_STEP_CHUNK,
          START_STEP_CHUNK,
          FINISH_STEP_CHUNK,
          FINISH_CHUNK,
        ]);

        // Assert - text and reasoning chunks are excluded
        const textChunks = result.filter((c) => c.type.startsWith(`text-`));
        const reasoningChunks = result.filter((c) => c.type.startsWith(`reasoning-`));
        expect(textChunks.length).toBe(0);
        expect(reasoningChunks.length).toBe(0);
      });
    });

    describe(`include then exclude`, () => {
      it(`should narrow with includeParts then excludeParts`, async () => {
        // Arrange
        const stream = convertArrayToStream([
          START_CHUNK,
          ...TEXT_CHUNKS,
          ...REASONING_CHUNKS,
          FINISH_CHUNK,
        ]);

        // Act - include text + reasoning, then exclude reasoning
        const result = await convertAsyncIterableToArray(
          pipe<MyUIMessage>(stream)
            .filter(includeParts([`text`, `reasoning`]))
            .filter(excludeParts(`reasoning`))
            .toStream(),
        );

        // Assert - only text content + meta/step chunks pass through
        expect(result).toEqual([
          START_CHUNK,
          ...TEXT_CHUNKS,
          START_STEP_CHUNK,
          FINISH_STEP_CHUNK,
          FINISH_CHUNK,
        ]);

        // Assert - reasoning chunks are excluded
        const reasoningChunks = result.filter((c) => c.type.startsWith(`reasoning-`));
        expect(reasoningChunks.length).toBe(0);
      });

      it(`should narrow with includeChunks then excludeChunks`, async () => {
        // Arrange
        const stream = convertArrayToStream([START_CHUNK, ...TEXT_CHUNKS, FINISH_CHUNK]);

        // Act - include text-start + text-delta + text-end, then exclude text-end
        const result = await convertAsyncIterableToArray(
          pipe<MyUIMessage>(stream)
            .filter(includeChunks([`text-start`, `text-delta`, `text-end`]))
            .filter(excludeChunks(`text-end`))
            .toStream(),
        );

        // Assert - text-start + text-delta + meta/step chunks pass through
        expect(result).toEqual([
          START_CHUNK,
          START_STEP_CHUNK,
          { type: `text-start`, id: `1` },
          { type: `text-delta`, id: `1`, delta: `Hello` },
          { type: `text-delta`, id: `1`, delta: ` World` },
          FINISH_STEP_CHUNK,
          FINISH_CHUNK,
        ]);

        // Assert - text-end chunks are excluded
        const textEndChunks = result.filter((c) => c.type === `text-end`);
        expect(textEndChunks.length).toBe(0);
      });
    });

    describe(`exclude then include`, () => {
      it(`should apply excludeParts then includeParts`, async () => {
        // Arrange
        const stream = convertArrayToStream([
          START_CHUNK,
          ...TEXT_CHUNKS,
          ...REASONING_CHUNKS,
          FINISH_CHUNK,
        ]);

        // Act - exclude reasoning, then include text
        const result = await convertAsyncIterableToArray(
          pipe<MyUIMessage>(stream)
            .filter(excludeParts(`reasoning`))
            .filter(includeParts(`text`))
            .toStream(),
        );

        // Assert - only text content + meta/step chunks pass through (step chunks from REASONING_CHUNKS also pass)
        expect(result).toEqual([
          START_CHUNK,
          ...TEXT_CHUNKS,
          START_STEP_CHUNK,
          FINISH_STEP_CHUNK,
          FINISH_CHUNK,
        ]);

        // Assert - reasoning chunks are excluded
        const reasoningChunks = result.filter((c) => c.type.startsWith(`reasoning-`));
        expect(reasoningChunks.length).toBe(0);
      });

      it(`should apply excludeChunks then includeChunks`, async () => {
        // Arrange
        const stream = convertArrayToStream([START_CHUNK, ...TEXT_CHUNKS, FINISH_CHUNK]);

        // Act - exclude text-end, then include text-delta
        const result = await convertAsyncIterableToArray(
          pipe<MyUIMessage>(stream)
            .filter(excludeChunks(`text-end`))
            .filter(includeChunks(`text-delta`))
            .toStream(),
        );

        // Assert - only text-delta + meta/step chunks pass through
        expect(result).toEqual([
          START_CHUNK,
          START_STEP_CHUNK,
          { type: `text-delta`, id: `1`, delta: `Hello` },
          { type: `text-delta`, id: `1`, delta: ` World` },
          FINISH_STEP_CHUNK,
          FINISH_CHUNK,
        ]);

        // Assert - text-start and text-end chunks are excluded
        const textStartChunks = result.filter((c) => c.type === `text-start`);
        const textEndChunks = result.filter((c) => c.type === `text-end`);
        expect(textStartChunks.length).toBe(0);
        expect(textEndChunks.length).toBe(0);
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

        // Assert - reasoning chunks are excluded
        const reasoningChunks = result.filter((c) => c.type.startsWith(`reasoning-`));
        expect(reasoningChunks.length).toBe(0);
      });

      it(`should chain multiple predicate filters`, async () => {
        // Arrange
        const stream = convertArrayToStream([
          START_CHUNK,
          ...TEXT_CHUNKS,
          ...REASONING_CHUNKS,
          FINISH_CHUNK,
        ]);

        // Act - first exclude reasoning, then exclude text-delta
        const result = await convertAsyncIterableToArray(
          pipe<MyUIMessage>(stream)
            .filter(({ part }) => part.type !== `reasoning`)
            .filter(({ chunk }) => chunk.type !== `text-delta`)
            .toStream(),
        );

        // Assert - text-start, text-end + meta/step chunks
        expect(result).toEqual([
          START_CHUNK,
          START_STEP_CHUNK,
          { type: `text-start`, id: `1` },
          { type: `text-end`, id: `1` },
          FINISH_STEP_CHUNK,
          START_STEP_CHUNK,
          FINISH_STEP_CHUNK,
          FINISH_CHUNK,
        ]);

        // Assert - reasoning and text-delta chunks are excluded
        const reasoningChunks = result.filter((c) => c.type.startsWith(`reasoning-`));
        const textDeltaChunks = result.filter((c) => c.type === `text-delta`);
        expect(reasoningChunks.length).toBe(0);
        expect(textDeltaChunks.length).toBe(0);
      });

      it(`should chain with predicate filter`, async () => {
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

    describe(`partType`, () => {
      it(`should call callback for matching part types without filtering`, async () => {
        // Arrange
        const stream = convertArrayToStream([
          START_CHUNK,
          ...TEXT_CHUNKS,
          ...REASONING_CHUNKS,
          FINISH_CHUNK,
        ]);
        const observed: Array<MyUIMessageChunk> = [];

        // Act
        const result = await convertAsyncIterableToArray(
          pipe<MyUIMessage>(stream)
            .on(partType(`text`), ({ chunk }) => {
              observed.push(chunk);
            })
            .toStream(),
        );

        // Assert - all chunks pass through
        expect(result).toEqual([START_CHUNK, ...TEXT_CHUNKS, ...REASONING_CHUNKS, FINISH_CHUNK]);
        // Assert - only text chunks were observed
        expect(observed.length).toBe(4);
        expect(observed.every((c) => c.type.startsWith(`text-`))).toBe(true);
      });

      it(`should call callback for multiple part types`, async () => {
        // Arrange
        const stream = convertArrayToStream([
          START_CHUNK,
          ...TEXT_CHUNKS,
          ...REASONING_CHUNKS,
          FINISH_CHUNK,
        ]);
        const observed: Array<MyUIMessageChunk> = [];

        // Act
        const result = await convertAsyncIterableToArray(
          pipe<MyUIMessage>(stream)
            .on(partType([`text`, `reasoning`]), ({ chunk }) => {
              observed.push(chunk);
            })
            .toStream(),
        );

        // Assert - all chunks pass through
        expect(result).toEqual([START_CHUNK, ...TEXT_CHUNKS, ...REASONING_CHUNKS, FINISH_CHUNK]);
        // Assert - text and reasoning chunks were observed
        expect(observed.length).toBe(8);
      });

      it(`should support async callbacks`, async () => {
        // Arrange
        const stream = convertArrayToStream([START_CHUNK, ...TEXT_CHUNKS, FINISH_CHUNK]);
        const observed: Array<string> = [];

        // Act
        await convertAsyncIterableToArray(
          pipe<MyUIMessage>(stream)
            .on(partType(`text`), async ({ chunk }) => {
              await new Promise((r) => setTimeout(r, 10));
              observed.push(chunk.type);
            })
            .toStream(),
        );

        // Assert
        expect(observed).toEqual([`text-start`, `text-delta`, `text-delta`, `text-end`]);
      });

      it(`should not observe meta chunks`, async () => {
        // Arrange
        const stream = convertArrayToStream([START_CHUNK, ...TEXT_CHUNKS, FINISH_CHUNK]);
        const observed: Array<string> = [];

        // Act
        await convertAsyncIterableToArray(
          pipe<MyUIMessage>(stream)
            .on(partType(`text`), ({ chunk }) => {
              observed.push(chunk.type);
            })
            .toStream(),
        );

        // Assert - no meta chunks observed
        expect(observed).not.toContain(`start`);
        expect(observed).not.toContain(`finish`);
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
      const textDeltaChunks = result.filter((c) => c.type === `text-delta`);
      expect(textDeltaChunks).toEqual([
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
      const reasoningChunks = result.filter((c) => c.type.startsWith(`reasoning-`));
      expect(reasoningChunks.length).toBe(0);
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
      const reasoningChunks = result.filter((c) => c.type.startsWith(`reasoning-`));
      expect(reasoningChunks.length).toBe(0);
      const textDeltaChunks = result.filter((c) => c.type === `text-delta`);
      expect(textDeltaChunks).toEqual([
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
      const reasoningChunks = result.filter((c) => c.type.startsWith(`reasoning-`));
      expect(reasoningChunks.length).toBe(0);
      const textDeltaChunks = result.filter((c) => c.type === `text-delta`);
      expect(textDeltaChunks).toEqual([
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

  describe(`input types`, () => {
    it(`should work with ReadableStream input`, async () => {
      // Arrange
      const stream = convertArrayToStream([START_CHUNK, ...TEXT_CHUNKS, FINISH_CHUNK]);

      // Act
      const result = await convertAsyncIterableToArray(
        pipe<MyUIMessage>(stream).filter(includeParts(`text`)).toStream(),
      );

      // Assert - TEXT_CHUNKS already includes start-step/finish-step
      expect(result).toEqual([START_CHUNK, ...TEXT_CHUNKS, FINISH_CHUNK]);
    });

    it(`should work with AsyncIterable input (plain async generator)`, async () => {
      // Arrange
      const asyncIterable = convertArrayToAsyncIterable([
        START_CHUNK,
        ...TEXT_CHUNKS,
        FINISH_CHUNK,
      ]);

      // Act
      const result = await convertAsyncIterableToArray(
        pipe<MyUIMessage>(asyncIterable).filter(includeParts(`text`)).toStream(),
      );

      // Assert - TEXT_CHUNKS already includes start-step/finish-step
      expect(result).toEqual([START_CHUNK, ...TEXT_CHUNKS, FINISH_CHUNK]);
    });

    it(`should work with AsyncIterableStream input (AI SDK type)`, async () => {
      // Arrange - AsyncIterableStream is both ReadableStream and AsyncIterable
      const asyncIterableStream = createAsyncIterableStream(
        convertArrayToStream([START_CHUNK, ...TEXT_CHUNKS, FINISH_CHUNK]),
      );

      // Act
      const result = await convertAsyncIterableToArray(
        pipe<MyUIMessage>(asyncIterableStream).filter(includeParts(`text`)).toStream(),
      );

      // Assert - TEXT_CHUNKS already includes start-step/finish-step
      expect(result).toEqual([START_CHUNK, ...TEXT_CHUNKS, FINISH_CHUNK]);
    });

    it(`should correctly associate part types with AsyncIterable input`, async () => {
      // Arrange - use interleaved chunks to verify part type tracking works
      const asyncIterable = convertArrayToAsyncIterable([
        START_CHUNK,
        ...TOOL_WITH_DATA_CHUNKS,
        FINISH_CHUNK,
      ]);
      const partTypesEncountered: Array<string> = [];

      // Act
      await convertAsyncIterableToArray(
        pipe<MyUIMessage>(asyncIterable)
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
    });
  });
});
