import { describe, expectTypeOf, it } from "vitest";
import type { ExtractChunk } from "../types.js";
import type {
  FileChunk,
  MyUIMessage,
  MyUIMessageChunk,
  MyUIMessagePart,
  ReasoningChunk,
  StartChunk,
  TextChunk,
  TextDeltaChunk,
  ToolChunk,
} from "../test/ui-message.js";
import { pipe } from "./pipe.js";
import {
  excludeChunks,
  excludeParts,
  includeChunks,
  includeParts,
  isChunk,
} from "./type-guards.js";

const mockStream = null as unknown as ReadableStream<MyUIMessageChunk>;

describe(`pipe types`, () => {
  describe(`filter`, () => {
    describe(`includeChunks`, () => {
      it(`should narrow chunk type for single type`, () => {
        pipe<MyUIMessage>(mockStream)
          .filter(includeChunks(`text-delta`))
          .map(({ chunk, part }) => {
            expectTypeOf(chunk).toEqualTypeOf<TextDeltaChunk>();
            expectTypeOf(part).toEqualTypeOf<{ type: `text` }>();
            return chunk;
          });
      });

      it(`should narrow chunk type for multiple types`, () => {
        pipe<MyUIMessage>(mockStream)
          .filter(includeChunks([`text-delta`, `text-end`]))
          .map(({ chunk, part }) => {
            expectTypeOf(chunk).toEqualTypeOf<
              ExtractChunk<MyUIMessage, `text-delta` | `text-end`>
            >();
            expectTypeOf(part).toEqualTypeOf<{ type: `text` }>();
            return chunk;
          });
      });

      it(`should preserve narrowed chunk type through plain filter predicate`, () => {
        pipe<MyUIMessage>(mockStream)
          .filter(includeChunks(`text-delta`))
          .filter(({ chunk }) => chunk.delta.length > 0)
          .map(({ chunk, part }) => {
            expectTypeOf(chunk).toEqualTypeOf<TextDeltaChunk>();
            expectTypeOf(part).toEqualTypeOf<{ type: `text` }>();
            return chunk;
          });
      });

      it(`should not allow meta chunk types in filter`, () => {
        // @ts-expect-error - meta chunk types should not be allowed
        pipe<MyUIMessage>(mockStream).filter(includeChunks(`start`));
      });
    });

    describe(`includeParts`, () => {
      it(`should narrow part.type and chunk types for single type`, () => {
        pipe<MyUIMessage>(mockStream)
          .filter(includeParts(`text`))
          .map(({ part, chunk }) => {
            expectTypeOf(part).toEqualTypeOf<{ type: `text` }>();
            expectTypeOf(chunk).toEqualTypeOf<TextChunk>();
            return chunk;
          });
      });

      it(`should narrow part.type and chunk types for multiple types`, () => {
        pipe<MyUIMessage>(mockStream)
          .filter(includeParts([`text`, `reasoning`]))
          .map(({ part, chunk }) => {
            expectTypeOf(part).toEqualTypeOf<{ type: `text` | `reasoning` }>();
            expectTypeOf(chunk).toEqualTypeOf<TextChunk | ReasoningChunk>();
            return chunk;
          });
      });

      it(`should narrow part.type and chunk types for tool parts`, () => {
        pipe<MyUIMessage>(mockStream)
          .filter(includeParts(`tool-weather`))
          .map(({ part, chunk }) => {
            expectTypeOf(part).toEqualTypeOf<{ type: `tool-weather` }>();
            expectTypeOf(chunk).toEqualTypeOf<ToolChunk>();
            return chunk;
          });
      });

      it(`should narrow part.type and chunk types for file parts`, () => {
        pipe<MyUIMessage>(mockStream)
          .filter(includeParts(`file`))
          .map(({ part, chunk }) => {
            expectTypeOf(part).toEqualTypeOf<{ type: `file` }>();
            expectTypeOf(chunk).toEqualTypeOf<FileChunk>();
            return chunk;
          });
      });

      it(`should preserve narrowed types through plain filter predicate`, () => {
        pipe<MyUIMessage>(mockStream)
          .filter(includeParts(`text`))
          .filter(({ chunk }) => chunk.type !== `text-start`)
          .map(({ part, chunk }) => {
            expectTypeOf(part).toEqualTypeOf<{ type: `text` }>();
            expectTypeOf(chunk).toEqualTypeOf<TextChunk>();
            return chunk;
          });
      });
    });

    describe(`excludeChunks`, () => {
      it(`should exclude single chunk type`, () => {
        pipe<MyUIMessage>(mockStream)
          .filter(excludeChunks(`text-delta`))
          .map(({ chunk, part }) => {
            /** text-delta should be excluded */
            expectTypeOf<TextDeltaChunk>().not.toExtend<typeof chunk>();
            /** text part should still be in part type since text-start/text-end remain */
            expectTypeOf<{ type: `text` }>().toExtend<typeof part>();
            return chunk;
          });
      });

      it(`should not allow meta chunk types`, () => {
        // @ts-expect-error - meta chunk types should not be allowed
        pipe<MyUIMessage>(mockStream).filter(excludeChunks(`start`));
      });
    });

    describe(`excludeParts`, () => {
      it(`should exclude single part type`, () => {
        pipe<MyUIMessage>(mockStream)
          .filter(excludeParts(`text`))
          .map(({ chunk, part }) => {
            /** text chunks should be excluded */
            expectTypeOf<TextChunk>().not.toExtend<typeof chunk>();
            /** text part should be excluded */
            expectTypeOf<{ type: `text` }>().not.toExtend<typeof part>();
            /** Other content chunks should still be included */
            expectTypeOf<ReasoningChunk>().toExtend<typeof chunk>();
            return chunk;
          });
      });

      it(`should exclude multiple part types`, () => {
        pipe<MyUIMessage>(mockStream)
          .filter(excludeParts([`text`, `reasoning`]))
          .map(({ chunk, part }) => {
            /** text and reasoning should be excluded */
            expectTypeOf<TextChunk>().not.toExtend<typeof chunk>();
            expectTypeOf<ReasoningChunk>().not.toExtend<typeof chunk>();
            expectTypeOf<{ type: `text` }>().not.toExtend<typeof part>();
            expectTypeOf<{ type: `reasoning` }>().not.toExtend<typeof part>();
            /** Other content chunks should still be included */
            expectTypeOf<ToolChunk>().toExtend<typeof chunk>();
            return chunk;
          });
      });
    });

    describe(`predicate`, () => {
      it(`should only receive content chunk types in filter predicate, not meta chunks`, () => {
        pipe<MyUIMessage>(mockStream).filter(({ chunk }) => {
          /** Meta chunks like StartChunk should not be included */
          expectTypeOf<StartChunk>().not.toExtend<typeof chunk>();
          /** Content chunks should be included */
          expectTypeOf<TextChunk>().toExtend<typeof chunk>();
          return true;
        });
      });

      it(`should not allow meta chunk types in filter`, () => {
        pipe<MyUIMessage>(mockStream).filter(({ chunk }) => {
          /** Should not allow meta chunk types like StartChunk */
          expectTypeOf<StartChunk>().not.toExtend<typeof chunk>();
          return true;
        });
      });
    });
  });

  describe(`map`, () => {
    it(`should only receive content chunk types in map callback, not meta chunks`, () => {
      pipe<MyUIMessage>(mockStream).map(({ chunk }) => {
        /** Meta chunks like StartChunk should not be included */
        expectTypeOf<StartChunk>().not.toExtend<typeof chunk>();
        /** Content chunks should be included */
        expectTypeOf<TextChunk>().toExtend<typeof chunk>();
        return chunk;
      });
    });

    it(`should preserve narrowed chunk type after filtering`, () => {
      pipe<MyUIMessage>(mockStream)
        .filter(includeParts(`text`))
        .map(({ chunk }) => {
          /** Should be narrowed to just TextChunk, not all content chunks */
          expectTypeOf(chunk).toEqualTypeOf<TextChunk>();
          return chunk;
        });
    });
  });

  describe(`on`, () => {
    describe(`isChunk`, () => {
      it(`should narrow chunk type in callback`, () => {
        pipe<MyUIMessage>(mockStream).on(isChunk(`text-delta`), ({ chunk, part }) => {
          expectTypeOf(chunk).toEqualTypeOf<TextDeltaChunk>();
          expectTypeOf(part).toEqualTypeOf<{ type: `text` }>();
        });
      });

      it(`should narrow chunk type for meta chunks`, () => {
        pipe<MyUIMessage>(mockStream).on(isChunk(`start`), ({ chunk, part }) => {
          expectTypeOf(chunk).toEqualTypeOf<StartChunk>();
          expectTypeOf(part).toEqualTypeOf<undefined>();
        });
      });

      it(`should infer part type from content chunk type`, () => {
        pipe<MyUIMessage>(mockStream).on(isChunk(`text-delta`), ({ chunk, part }) => {
          expectTypeOf(chunk).toEqualTypeOf<TextDeltaChunk>();
          expectTypeOf(part).toEqualTypeOf<{ type: `text` }>();
        });
      });

      it(`should infer undefined part for meta chunk type`, () => {
        pipe<MyUIMessage>(mockStream).on(isChunk(`start`), ({ chunk, part }) => {
          expectTypeOf(chunk).toEqualTypeOf<StartChunk>();
          expectTypeOf(part).toEqualTypeOf<undefined>();
        });
      });

      it(`should infer union part type for multiple chunk types`, () => {
        pipe<MyUIMessage>(mockStream).on(
          isChunk([`text-delta`, `reasoning-delta`]),
          ({ chunk, part }) => {
            expectTypeOf(chunk).toEqualTypeOf<
              Extract<MyUIMessageChunk, { type: `text-delta` | `reasoning-delta` }>
            >();
            expectTypeOf(part).toEqualTypeOf<{ type: `text` | `reasoning` }>();
          },
        );
      });

      it(`should infer part type for content and meta chunk types`, () => {
        pipe<MyUIMessage>(mockStream).on(isChunk([`text-delta`, `start`]), ({ chunk, part }) => {
          expectTypeOf(chunk).toEqualTypeOf<
            Extract<MyUIMessageChunk, { type: `text-delta` | `start` }>
          >();
          expectTypeOf(part).toEqualTypeOf<{ type: `text` } | undefined>();
        });
      });

      it(`should preserve pipeline types after on()`, () => {
        pipe<MyUIMessage>(mockStream)
          .filter(includeParts(`text`))
          .on(isChunk(`text-delta`), () => {})
          .map(({ chunk, part }) => {
            expectTypeOf(chunk).toEqualTypeOf<TextChunk>();
            expectTypeOf(part).toEqualTypeOf<{ type: `text` }>();
            return chunk;
          });
      });
    });

    describe(`predicate`, () => {
      it(`should receive current pipeline chunk types in predicate`, () => {
        pipe<MyUIMessage>(mockStream).on(
          ({ chunk, part }) => {
            expectTypeOf(chunk).toEqualTypeOf<MyUIMessageChunk>();
            expectTypeOf(part).toEqualTypeOf<{ type: string } | undefined>();
            return true;
          },
          ({ chunk, part }) => {
            expectTypeOf(chunk).toEqualTypeOf<MyUIMessageChunk>();
            expectTypeOf(part).toEqualTypeOf<{ type: MyUIMessagePart[`type`] } | undefined>();
          },
        );
      });

      it(`should preserve narrowed types from filter`, () => {
        pipe<MyUIMessage>(mockStream)
          .filter(includeParts(`text`))
          .on(
            ({ chunk }) => chunk.type === `text-delta`,
            ({ chunk, part }) => {
              expectTypeOf(chunk).toEqualTypeOf<TextChunk>();
              expectTypeOf(part).toEqualTypeOf<{ type: `text` } | undefined>();
            },
          );
      });
    });
  });
});
