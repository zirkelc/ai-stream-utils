import {
  convertArrayToReadableStream,
  convertAsyncIterableToArray,
} from '@ai-sdk/provider-utils/test';
import { describe, expect, it } from 'vitest';
import { excludeParts, includeParts } from './filter-ui-message-stream.js';
import {
  partType,
  pipeUIMessageStream,
  type ScanOperator,
} from './pipe-ui-message-stream.js';
import { smoothStreaming } from './smooth-streaming.js';
import {
  FINISH_CHUNK,
  type MyUIMessage,
  REASONING_CHUNKS,
  START_CHUNK,
  TEXT_CHUNKS,
  TOOL_SERVER_CHUNKS,
} from './utils/test-utils.js';

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

      /* Assert - only text content chunks are returned */
      expect(result).toEqual(TEXT_CONTENT_CHUNKS);
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

  describe(`match operations`, () => {
    it(`should apply match with map to specific part type`, async () => {
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
          .match(partType(`text`), (pipe) =>
            pipe.map(({ chunk }) => {
              if (chunk.type === `text-delta`) {
                return { ...chunk, delta: chunk.delta.toUpperCase() };
              }
              return chunk;
            }),
          )
          .toStream(),
      );

      /* Assert */
      /* Text chunks should be transformed */
      const textDeltas = result.filter((c) => c.type === `text-delta`);
      expect(textDeltas).toEqual([
        { type: `text-delta`, id: `1`, delta: `HELLO` },
        { type: `text-delta`, id: `1`, delta: ` WORLD` },
      ]);

      /* Reasoning chunks should pass through unchanged */
      const reasoningDeltas = result.filter(
        (c) => c.type === `reasoning-delta`,
      );
      expect(reasoningDeltas).toEqual([
        { type: `reasoning-delta`, id: `2`, delta: `Think` },
        { type: `reasoning-delta`, id: `2`, delta: `ing...` },
      ]);
    });

    it(`should apply match with filter to specific part type`, async () => {
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
          .match(partType(`text`), (pipe) =>
            pipe.filter(({ chunk }) => chunk.type !== `text-start`),
          )
          .toStream(),
      );

      /* Assert */
      /* text-start should be filtered out */
      const textStarts = result.filter((c) => c.type === `text-start`);
      expect(textStarts.length).toBe(0);

      /* Other text chunks should remain */
      const textDeltas = result.filter((c) => c.type === `text-delta`);
      expect(textDeltas.length).toBe(2);

      /* Reasoning chunks should pass through unchanged */
      const reasoningStarts = result.filter(
        (c) => c.type === `reasoning-start`,
      );
      expect(reasoningStarts.length).toBe(1);
    });

    it(`should chain filter and map within match`, async () => {
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
          .match(partType(`text`), (pipe) =>
            pipe
              .filter(({ chunk }) => chunk.type !== `text-end`)
              .map(({ chunk }) => {
                if (chunk.type === `text-delta`) {
                  return { ...chunk, delta: chunk.delta.toUpperCase() };
                }
                return chunk;
              }),
          )
          .toStream(),
      );

      /* Assert */
      /* text-end should be filtered out, but text-start and text-delta remain */
      const textEnds = result.filter((c) => c.type === `text-end`);
      expect(textEnds.length).toBe(0);

      const textDeltas = result.filter((c) => c.type === `text-delta`);
      expect(textDeltas).toEqual([
        { type: `text-delta`, id: `1`, delta: `HELLO` },
        { type: `text-delta`, id: `1`, delta: ` WORLD` },
      ]);

      /* text-start should still be present */
      const textStarts = result.filter((c) => c.type === `text-start`);
      expect(textStarts.length).toBe(1);
    });

    it(`should apply multiple match operations for different part types`, async () => {
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
          .match(partType(`text`), (pipe) =>
            pipe.map(({ chunk }) => {
              if (chunk.type === `text-delta`) {
                return { ...chunk, delta: `[TEXT] ${chunk.delta}` };
              }
              return chunk;
            }),
          )
          .match(partType(`reasoning`), (pipe) =>
            pipe.map(({ chunk }) => {
              if (chunk.type === `reasoning-delta`) {
                return { ...chunk, delta: `[REASONING] ${chunk.delta}` };
              }
              return chunk;
            }),
          )
          .toStream(),
      );

      /* Assert */
      const textDeltas = result.filter((c) => c.type === `text-delta`);
      expect(textDeltas).toEqual([
        { type: `text-delta`, id: `1`, delta: `[TEXT] Hello` },
        { type: `text-delta`, id: `1`, delta: `[TEXT]  World` },
      ]);

      const reasoningDeltas = result.filter(
        (c) => c.type === `reasoning-delta`,
      );
      expect(reasoningDeltas).toEqual([
        { type: `reasoning-delta`, id: `2`, delta: `[REASONING] Think` },
        { type: `reasoning-delta`, id: `2`, delta: `[REASONING] ing...` },
      ]);
    });

    it(`should match with array of part types`, async () => {
      /* Arrange */
      const stream = convertArrayToReadableStream([
        START_CHUNK,
        ...TEXT_CHUNKS,
        ...REASONING_CHUNKS,
        ...TOOL_SERVER_CHUNKS,
        FINISH_CHUNK,
      ]);

      /* Act */
      const result = await convertAsyncIterableToArray(
        pipeUIMessageStream<MyUIMessage>(stream)
          .match(partType(`text`, `reasoning`), (pipe) =>
            pipe.filter(() => false),
          )
          .toStream(),
      );

      /* Assert */
      /* Text and reasoning should be filtered out */
      const textChunks = result.filter((c) => c.type.startsWith(`text`));
      expect(textChunks.length).toBe(0);

      const reasoningChunks = result.filter((c) =>
        c.type.startsWith(`reasoning`),
      );
      expect(reasoningChunks.length).toBe(0);

      /* Tool chunks should remain */
      const toolChunks = result.filter((c) => c.type.startsWith(`tool`));
      expect(toolChunks.length).toBe(4);
    });

    it(`should combine filter, map, and match`, async () => {
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
          .match(partType(`text`), (pipe) =>
            pipe.map(({ chunk }) => {
              if (chunk.type === `text-delta`) {
                return { ...chunk, delta: chunk.delta.toUpperCase() };
              }
              return chunk;
            }),
          )
          .filter(excludeParts([`reasoning`]))
          .toStream(),
      );

      /* Assert */
      const textDeltas = result.filter((c) => c.type === `text-delta`);
      expect(textDeltas).toEqual([
        { type: `text-delta`, id: `1`, delta: `HELLO` },
        { type: `text-delta`, id: `1`, delta: ` WORLD` },
      ]);

      /* Reasoning should be filtered out by the second filter */
      const reasoningChunks = result.filter((c) =>
        c.type.startsWith(`reasoning`),
      );
      expect(reasoningChunks.length).toBe(0);
    });

    it(`should apply negated predicate to exclude specific part type`, async () => {
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
          .match(
            ({ part }) => part.type !== `text`,
            (pipe) =>
              pipe.map(({ chunk }) => {
                if (chunk.type === `reasoning-delta`) {
                  return { ...chunk, delta: `[NOT-TEXT] ${chunk.delta}` };
                }
                return chunk;
              }),
          )
          .toStream(),
      );

      /* Assert */
      /* Reasoning chunks should be transformed (they match the negated predicate) */
      const reasoningDeltas = result.filter(
        (c) => c.type === `reasoning-delta`,
      );
      expect(reasoningDeltas).toEqual([
        { type: `reasoning-delta`, id: `2`, delta: `[NOT-TEXT] Think` },
        { type: `reasoning-delta`, id: `2`, delta: `[NOT-TEXT] ing...` },
      ]);

      /* Text chunks should pass through unchanged */
      const textDeltas = result.filter((c) => c.type === `text-delta`);
      expect(textDeltas).toEqual([
        { type: `text-delta`, id: `1`, delta: `Hello` },
        { type: `text-delta`, id: `1`, delta: ` World` },
      ]);
    });

    it(`should apply negated predicate with multiple excluded types`, async () => {
      /* Arrange */
      const stream = convertArrayToReadableStream([
        START_CHUNK,
        ...TEXT_CHUNKS,
        ...REASONING_CHUNKS,
        ...TOOL_SERVER_CHUNKS,
        FINISH_CHUNK,
      ]);

      /* Act */
      const result = await convertAsyncIterableToArray(
        pipeUIMessageStream<MyUIMessage>(stream)
          .match(
            ({ part }) => part.type !== `text` && part.type !== `reasoning`,
            (pipe) => pipe.filter(() => false),
          )
          .toStream(),
      );

      /* Assert */
      /* Text and reasoning should pass through (not matched by the negated predicate) */
      const textChunks = result.filter((c) => c.type.startsWith(`text`));
      expect(textChunks.length).toBe(4);

      const reasoningChunks = result.filter((c) =>
        c.type.startsWith(`reasoning`),
      );
      expect(reasoningChunks.length).toBe(4);

      /* Tool chunks should be filtered out (matched by the negated predicate and then filtered) */
      const toolChunks = result.filter((c) => c.type.startsWith(`tool`));
      expect(toolChunks.length).toBe(0);
    });

    it(`should use partType and negated predicate together for exhaustive matching`, async () => {
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
          .match(partType(`text`), (pipe) =>
            pipe.map(({ chunk }) => {
              if (chunk.type === `text-delta`) {
                return { ...chunk, delta: `[TEXT] ${chunk.delta}` };
              }
              return chunk;
            }),
          )
          .match(
            ({ part }) => part.type !== `text`,
            (pipe) =>
              pipe.map(({ chunk }) => {
                if (chunk.type === `reasoning-delta`) {
                  return { ...chunk, delta: `[OTHER] ${chunk.delta}` };
                }
                return chunk;
              }),
          )
          .toStream(),
      );

      /* Assert */
      const textDeltas = result.filter((c) => c.type === `text-delta`);
      expect(textDeltas).toEqual([
        { type: `text-delta`, id: `1`, delta: `[TEXT] Hello` },
        { type: `text-delta`, id: `1`, delta: `[TEXT]  World` },
      ]);

      const reasoningDeltas = result.filter(
        (c) => c.type === `reasoning-delta`,
      );
      expect(reasoningDeltas).toEqual([
        { type: `reasoning-delta`, id: `2`, delta: `[OTHER] Think` },
        { type: `reasoning-delta`, id: `2`, delta: `[OTHER] ing...` },
      ]);
    });

    it(`should narrow part.type in match callback`, async () => {
      /* Arrange */
      const stream = convertArrayToReadableStream([
        START_CHUNK,
        ...TEXT_CHUNKS,
        ...TOOL_SERVER_CHUNKS,
        FINISH_CHUNK,
      ]);

      const matchedPartTypes: Array<string> = [];

      /* Act */
      await convertAsyncIterableToArray(
        pipeUIMessageStream<MyUIMessage>(stream)
          .match(partType(`tool-weather`), (pipe) =>
            pipe.map(({ chunk, part }) => {
              /* part only has type field now */
              matchedPartTypes.push(part.type);
              return chunk;
            }),
          )
          .toStream(),
      );

      /* Assert */
      /* All matched parts should have type 'tool-weather' */
      expect(matchedPartTypes.length).toBeGreaterThan(0);
      expect(matchedPartTypes.every((t) => t === `tool-weather`)).toBe(true);
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

      /* Assert - only content chunks are returned */
      expect(result).toEqual(TEXT_CONTENT_CHUNKS);
    });
  });

  describe(`type narrowing with filter`, () => {
    it(`should narrow part.type after includeParts filter`, async () => {
      /* Arrange */
      const stream = convertArrayToReadableStream([
        START_CHUNK,
        ...TEXT_CHUNKS,
        ...REASONING_CHUNKS,
        FINISH_CHUNK,
      ]);

      const partTypes: Array<string> = [];

      /* Act */
      const result = await convertAsyncIterableToArray(
        pipeUIMessageStream<MyUIMessage>(stream)
          .filter(includeParts([`text`]))
          .map(({ chunk, part }) => {
            /* part only has type field now */
            partTypes.push(part.type);
            return chunk;
          })
          .toStream(),
      );

      /* Assert */
      expect(result.length).toBeGreaterThan(0);
      expect(partTypes.every((t) => t === `text`)).toBe(true);
    });

    it(`should narrow part.type after excludeParts filter`, async () => {
      /* Arrange */
      const stream = convertArrayToReadableStream([
        START_CHUNK,
        ...TEXT_CHUNKS,
        ...REASONING_CHUNKS,
        FINISH_CHUNK,
      ]);

      const partTypes: Array<string> = [];

      /* Act */
      const result = await convertAsyncIterableToArray(
        pipeUIMessageStream<MyUIMessage>(stream)
          .filter(excludeParts([`file`]))
          .map(({ chunk, part }) => {
            /* part only has type field now */
            partTypes.push(part.type);
            return chunk;
          })
          .toStream(),
      );

      /* Assert */
      expect(result.length).toBeGreaterThan(0);
      /* Should have text and reasoning but not file */
      expect(partTypes.includes(`text`)).toBe(true);
      expect(partTypes.includes(`reasoning`)).toBe(true);
      expect(partTypes.includes(`file`)).toBe(false);
    });

    it(`should chain filter narrowing correctly`, async () => {
      /* Arrange */
      const stream = convertArrayToReadableStream([
        START_CHUNK,
        ...TEXT_CHUNKS,
        ...REASONING_CHUNKS,
        FINISH_CHUNK,
      ]);

      const partTypes: Array<string> = [];

      /* Act */
      const result = await convertAsyncIterableToArray(
        pipeUIMessageStream<MyUIMessage>(stream)
          .filter(includeParts([`text`, `reasoning`]))
          .filter(excludeParts([`reasoning`]))
          .map(({ chunk, part }) => {
            /* After both filters, part.type should only be 'text' */
            partTypes.push(part.type);
            return chunk;
          })
          .toStream(),
      );

      /* Assert - only text content chunks are returned */
      expect(result).toEqual(TEXT_CONTENT_CHUNKS);
      expect(partTypes.every((t) => t === `text`)).toBe(true);
    });

    it(`should preserve narrowed type through plain filter predicate`, async () => {
      /* Arrange */
      const stream = convertArrayToReadableStream([
        START_CHUNK,
        ...TEXT_CHUNKS,
        ...REASONING_CHUNKS,
        FINISH_CHUNK,
      ]);

      const partTypes: Array<string> = [];

      /* Act */
      const result = await convertAsyncIterableToArray(
        pipeUIMessageStream<MyUIMessage>(stream)
          .filter(includeParts([`text`, `reasoning`]))
          /* Plain predicate should preserve the narrowed type */
          .filter(({ part }) => part.type === `text`)
          .map(({ chunk, part }) => {
            partTypes.push(part.type);
            return chunk;
          })
          .toStream(),
      );

      /* Assert - only text content chunks are returned */
      expect(result).toEqual(TEXT_CONTENT_CHUNKS);
      expect(partTypes.every((t) => t === `text`)).toBe(true);
    });

    it(`should narrow type after filter then use in match`, async () => {
      /* Arrange */
      const stream = convertArrayToReadableStream([
        START_CHUNK,
        ...TEXT_CHUNKS,
        ...REASONING_CHUNKS,
        FINISH_CHUNK,
      ]);

      const matchedPartTypes: Array<string> = [];

      /* Act */
      const result = await convertAsyncIterableToArray(
        pipeUIMessageStream<MyUIMessage>(stream)
          .filter(includeParts([`text`, `reasoning`]))
          .match(partType(`text`), (pipe) =>
            pipe.map(({ chunk, part }) => {
              /* part.type should be 'text' inside match */
              matchedPartTypes.push(part.type);
              if (chunk.type === `text-delta`) {
                return { ...chunk, delta: chunk.delta.toUpperCase() };
              }
              return chunk;
            }),
          )
          .toStream(),
      );

      /* Assert */
      const textDeltas = result.filter((c) => c.type === `text-delta`);
      expect(textDeltas).toEqual([
        { type: `text-delta`, id: `1`, delta: `HELLO` },
        { type: `text-delta`, id: `1`, delta: ` WORLD` },
      ]);
      expect(matchedPartTypes.every((t) => t === `text`)).toBe(true);
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

  describe(`scan operations`, () => {
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

    it(`should accept ScanOperator object pattern`, async () => {
      /* Arrange */
      const stream = convertArrayToReadableStream([
        START_CHUNK,
        ...TEXT_CHUNKS,
        FINISH_CHUNK,
      ]);

      const countingOperator: ScanOperator<MyUIMessage, { count: number }> = {
        initial: () => ({ count: 0 }),
        reducer: (state, { chunk }) => {
          state.count++;
          if (chunk.type === `text-delta`) {
            return { ...chunk, delta: `[${state.count}] ${chunk.delta}` };
          }
          return chunk;
        },
      };

      /* Act */
      const result = await convertAsyncIterableToArray(
        pipeUIMessageStream<MyUIMessage>(stream)
          .scan(countingOperator)
          .toStream(),
      );

      /* Assert */
      const textDeltas = result.filter((c) => c.type === `text-delta`);
      expect(textDeltas).toEqual([
        { type: `text-delta`, id: `1`, delta: `[2] Hello` },
        { type: `text-delta`, id: `1`, delta: `[3]  World` },
      ]);
    });

    it(`should accept ScanOperator with finalize`, async () => {
      /* Arrange */
      const stream = convertArrayToReadableStream([
        START_CHUNK,
        ...TEXT_CHUNKS,
        FINISH_CHUNK,
      ]);

      const bufferingOperator: ScanOperator<MyUIMessage, { buffer: string }> = {
        initial: { buffer: `` },
        reducer: (state, { chunk }) => {
          if (chunk.type === `text-delta`) {
            state.buffer += chunk.delta;
            return null;
          }
          return chunk;
        },
        finalize: (state) => {
          if (state.buffer) {
            return {
              type: `text-delta` as const,
              id: `1`,
              delta: state.buffer,
            };
          }
          return null;
        },
      };

      /* Act */
      const result = await convertAsyncIterableToArray(
        pipeUIMessageStream<MyUIMessage>(stream)
          .scan(bufferingOperator)
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

    it(`should work with smoothStreaming() operator`, async () => {
      /* Arrange */
      const stream = convertArrayToReadableStream([
        START_CHUNK,
        { type: `text-start` as const, id: `1` },
        { type: `text-delta` as const, id: `1`, delta: `Why ` },
        { type: `text-delta` as const, id: `1`, delta: `don't ` },
        { type: `text-delta` as const, id: `1`, delta: `scientists ` },
        { type: `text-delta` as const, id: `1`, delta: `trust ` },
        { type: `text-delta` as const, id: `1`, delta: `atoms?` },
        { type: `text-end` as const, id: `1` },
        FINISH_CHUNK,
      ]);

      /* Act */
      const result = await convertAsyncIterableToArray(
        pipeUIMessageStream<MyUIMessage>(stream)
          .scan(smoothStreaming())
          .toStream(),
      );

      /* Assert */
      const textDeltas = result.filter((c) => c.type === `text-delta`);
      /** Each word with trailing space should be emitted separately */
      expect(textDeltas).toEqual([
        { type: `text-delta`, id: `1`, delta: `Why ` },
        { type: `text-delta`, id: `1`, delta: `don't ` },
        { type: `text-delta`, id: `1`, delta: `scientists ` },
        { type: `text-delta`, id: `1`, delta: `trust ` },
        { type: `text-delta`, id: `1`, delta: `atoms?` },
      ]);
    });

    it(`should work with smoothStreaming() custom pattern`, async () => {
      /* Arrange */
      const stream = convertArrayToReadableStream([
        START_CHUNK,
        { type: `text-start` as const, id: `1` },
        { type: `text-delta` as const, id: `1`, delta: `Hello. ` },
        { type: `text-delta` as const, id: `1`, delta: `World! ` },
        { type: `text-delta` as const, id: `1`, delta: `How are you?` },
        { type: `text-end` as const, id: `1` },
        FINISH_CHUNK,
      ]);

      /* Act - use sentence boundary pattern */
      const result = await convertAsyncIterableToArray(
        pipeUIMessageStream<MyUIMessage>(stream)
          .scan(smoothStreaming({ pattern: /[.!?]\s+/m }))
          .toStream(),
      );

      /* Assert */
      const textDeltas = result.filter((c) => c.type === `text-delta`);
      /** Should emit on sentence boundaries */
      expect(textDeltas).toEqual([
        { type: `text-delta`, id: `1`, delta: `Hello. ` },
        { type: `text-delta`, id: `1`, delta: `World! ` },
        { type: `text-delta`, id: `1`, delta: `How are you?` },
      ]);
    });
  });
});
