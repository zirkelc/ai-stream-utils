import {
  convertArrayToReadableStream,
  convertAsyncIterableToArray,
} from '@ai-sdk/provider-utils/test';
import { describe, expect, it } from 'vitest';
import { excludeParts, includeParts } from './filter-ui-message-stream.js';
import {
  isNotPartType,
  isPartType,
  pipeUIMessageStream,
} from './pipe-ui-message-stream.js';
import {
  FINISH_CHUNK,
  type MyUIMessage,
  REASONING_CHUNKS,
  START_CHUNK,
  TEXT_CHUNKS,
  TOOL_SERVER_CHUNKS,
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
          .match(isPartType(`text`), (pipe) =>
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
          .match(isPartType(`text`), (pipe) =>
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
          .match(isPartType(`text`), (pipe) =>
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
          .match(isPartType(`text`), (pipe) =>
            pipe.map(({ chunk }) => {
              if (chunk.type === `text-delta`) {
                return { ...chunk, delta: `[TEXT] ${chunk.delta}` };
              }
              return chunk;
            }),
          )
          .match(isPartType(`reasoning`), (pipe) =>
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
          .match(isPartType([`text`, `reasoning`]), (pipe) =>
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
          .match(isPartType(`text`), (pipe) =>
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

    it(`should apply isNotPartType to exclude specific part type`, async () => {
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
          .match(isNotPartType(`text`), (pipe) =>
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
      /* Reasoning chunks should be transformed (they match isNotPartType('text')) */
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

    it(`should apply isNotPartType with array of excluded types`, async () => {
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
          .match(isNotPartType([`text`, `reasoning`]), (pipe) =>
            pipe.filter(() => false),
          )
          .toStream(),
      );

      /* Assert */
      /* Text and reasoning should pass through (not matched by isNotPartType) */
      const textChunks = result.filter((c) => c.type.startsWith(`text`));
      expect(textChunks.length).toBe(4);

      const reasoningChunks = result.filter((c) =>
        c.type.startsWith(`reasoning`),
      );
      expect(reasoningChunks.length).toBe(4);

      /* Tool chunks should be filtered out (matched by isNotPartType and then filtered) */
      const toolChunks = result.filter((c) => c.type.startsWith(`tool`));
      expect(toolChunks.length).toBe(0);
    });

    it(`should use isPartType and isNotPartType together for exhaustive matching`, async () => {
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
          .match(isPartType(`text`), (pipe) =>
            pipe.map(({ chunk }) => {
              if (chunk.type === `text-delta`) {
                return { ...chunk, delta: `[TEXT] ${chunk.delta}` };
              }
              return chunk;
            }),
          )
          .match(isNotPartType(`text`), (pipe) =>
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

    it(`should provide typed part in match callback`, async () => {
      /* Arrange */
      const stream = convertArrayToReadableStream([
        START_CHUNK,
        ...TEXT_CHUNKS,
        ...TOOL_SERVER_CHUNKS,
        FINISH_CHUNK,
      ]);

      const toolInputs: Array<{ location?: string }> = [];

      /* Act */
      await convertAsyncIterableToArray(
        pipeUIMessageStream<MyUIMessage>(stream)
          .match(isPartType(`tool-weather`), (pipe) =>
            pipe.map(({ chunk, part }) => {
              /* part should be typed as tool-weather part */
              /* input is only available after tool-input-available chunk */
              if (part.input && part.input.location) {
                toolInputs.push(part.input);
              }
              return chunk;
            }),
          )
          .toStream(),
      );

      /* Assert */
      /* Input should be captured when tool-input-available or later chunks arrive */
      expect(toolInputs.length).toBeGreaterThan(0);
      /* The last captured input should have the location */
      expect(toolInputs[toolInputs.length - 1]).toEqual({ location: `NYC` });
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

  describe(`type narrowing with filter`, () => {
    it(`should narrow part type after includeParts filter`, async () => {
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
          .map(({ chunk, part }) => {
            /* part should be typed as TextPart - accessing .text should work */
            if (part.type === `text`) {
              /* This verifies the type is correctly narrowed to TextPart */
              const _text: string = part.text;
              void _text;
            }
            return chunk;
          })
          .toStream(),
      );

      /* Assert */
      expect(result.length).toBeGreaterThan(0);
    });

    it(`should narrow part type after excludeParts filter`, async () => {
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
          .filter(excludeParts([`file`]))
          .map(({ chunk, part }) => {
            /* part should include text, reasoning, tool-weather, etc. but NOT file */
            if (part.type === `text`) {
              const _text: string = part.text;
              void _text;
            }
            if (part.type === `reasoning`) {
              const _text: string = part.text;
              void _text;
            }
            return chunk;
          })
          .toStream(),
      );

      /* Assert */
      expect(result.length).toBeGreaterThan(0);
    });

    it(`should chain filter narrowing correctly`, async () => {
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
          .map(({ chunk, part }) => {
            /* After both filters, part should only be TextPart */
            if (part.type === `text`) {
              const _text: string = part.text;
              void _text;
            }
            return chunk;
          })
          .toStream(),
      );

      /* Assert */
      expect(result).toEqual([START_CHUNK, ...TEXT_CHUNKS, FINISH_CHUNK]);
    });

    it(`should preserve narrowed type through plain filter predicate`, async () => {
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
          /* Plain predicate should preserve the narrowed type */
          .filter(({ part }) => part.type === `text`)
          .map(({ chunk, part }) => {
            /* part should still be TextPart | ReasoningPart (narrowed by includeParts) */
            if (part.type === `text`) {
              const _text: string = part.text;
              void _text;
            }
            return chunk;
          })
          .toStream(),
      );

      /* Assert */
      /* Only text chunks should remain after filtering to part.type === 'text' */
      const textChunks = result.filter(
        (c) =>
          c.type.startsWith(`text`) ||
          c.type === `start` ||
          c.type === `finish`,
      );
      expect(textChunks.length).toBe(
        6,
      ); /* start + text-start + 2 text-delta + text-end + finish */
    });

    it(`should narrow type after filter then use in match`, async () => {
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
          .match(isPartType(`text`), (pipe) =>
            pipe.map(({ chunk, part }) => {
              /* part should be TextPart inside match */
              const _text: string = part.text;
              void _text;
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
