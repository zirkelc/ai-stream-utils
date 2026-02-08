import { describe, expectTypeOf, it } from "vitest";
import type {
  FileChunk,
  MyUIMessage,
  MyUIMessageChunk,
  ReasoningChunk,
  TextChunk,
  TextDeltaChunk,
  TextPart,
  ToolChunk,
} from "../test/ui-message.js";
import { isChunkType } from "./chunk-type.js";
import { isPartType } from "./part-type.js";
import { pipe } from "./pipe.js";

/** Mock stream for type tests */
const mockStream = null as unknown as ReadableStream<MyUIMessageChunk>;

describe(`pipe types`, () => {
  describe(`filter with isPartType`, () => {
    it(`should narrow part.type and chunk types for single type`, () => {
      pipe<MyUIMessage>(mockStream)
        .filter(isPartType(`text`))
        .map(({ part, chunk }) => {
          /** part is now { type: 'text' } not full TextPart */
          expectTypeOf(part).toEqualTypeOf<{ type: `text` }>();
          expectTypeOf(chunk).toEqualTypeOf<TextChunk>();
          return chunk;
        });
    });

    it(`should narrow part.type and chunk types for multiple types`, () => {
      pipe<MyUIMessage>(mockStream)
        .filter(isPartType([`text`, `reasoning`]))
        .map(({ part, chunk }) => {
          /** part.type is narrowed to 'text' | 'reasoning' */
          expectTypeOf(part).toEqualTypeOf<{ type: `text` | `reasoning` }>();
          expectTypeOf(chunk).toEqualTypeOf<TextChunk | ReasoningChunk>();
          return chunk;
        });
    });

    it(`should narrow part.type and chunk types for tool parts`, () => {
      pipe<MyUIMessage>(mockStream)
        .filter(isPartType(`tool-weather`))
        .map(({ part, chunk }) => {
          expectTypeOf(part).toEqualTypeOf<{ type: `tool-weather` }>();
          expectTypeOf(chunk).toEqualTypeOf<ToolChunk>();
          return chunk;
        });
    });

    it(`should narrow part.type and chunk types for file parts`, () => {
      pipe<MyUIMessage>(mockStream)
        .filter(isPartType(`file`))
        .map(({ part, chunk }) => {
          expectTypeOf(part).toEqualTypeOf<{ type: `file` }>();
          expectTypeOf(chunk).toEqualTypeOf<FileChunk>();
          return chunk;
        });
    });

    it(`should preserve narrowed types through plain filter predicate`, () => {
      pipe<MyUIMessage>(mockStream)
        .filter(isPartType(`text`))
        .filter(({ chunk }) => chunk.type !== `text-start`)
        .map(({ part, chunk }) => {
          /** Plain predicate preserves current types */
          expectTypeOf(part).toEqualTypeOf<{ type: `text` }>();
          expectTypeOf(chunk).toEqualTypeOf<TextChunk>();
          return chunk;
        });
    });
  });

  describe(`filter with isChunkType`, () => {
    it(`should narrow chunk type for single type`, () => {
      pipe<MyUIMessage>(mockStream)
        .filter(isChunkType(`text-delta`))
        .map(({ chunk, part }) => {
          /** chunkType narrows both chunk and part types */
          expectTypeOf(chunk).toEqualTypeOf<TextDeltaChunk>();
          expectTypeOf(part).toEqualTypeOf<{ type: `text` }>();
          return chunk;
        });
    });

    it(`should narrow chunk type for multiple types`, () => {
      pipe<MyUIMessage>(mockStream)
        .filter(isChunkType([`text-delta`, `text-end`]))
        .map(({ chunk, part }) => {
          /** chunkType narrows both chunk and part types */
          expectTypeOf(chunk).toEqualTypeOf<
            Extract<MyUIMessageChunk, { type: `text-delta` | `text-end` }>
          >();
          expectTypeOf(part).toEqualTypeOf<{ type: `text` }>();
          return chunk;
        });
    });

    it(`should preserve narrowed chunk type through plain filter predicate`, () => {
      pipe<MyUIMessage>(mockStream)
        .filter(isChunkType(`text-delta`))
        .filter(({ chunk }) => chunk.delta.length > 0)
        .map(({ chunk, part }) => {
          /** Plain predicate preserves narrowed chunk and part types */
          expectTypeOf(chunk).toEqualTypeOf<TextDeltaChunk>();
          expectTypeOf(part).toEqualTypeOf<{ type: `text` }>();
          return chunk;
        });
    });
  });

  // describe(`reduce`, () => {
  //   it(`should transform ChunkInput to PartInput with full part`, () => {
  //     pipe<MyUIMessage>(mockStream)
  //       .filter(isPartType(`text`))
  //       .reduce()
  //       .map(({ part }) => {
  //         /** After reduce, part is the full TextPart type */
  //         expectTypeOf(part).toEqualTypeOf<TextPart>();
  //         return part;
  //       });
  //   });

  //   it(`should allow further narrowing with partType after reduce`, () => {
  //     pipe<MyUIMessage>(mockStream)
  //       .filter(isPartType(`text`, `reasoning`))
  //       .reduce()
  //       .filter(isPartType(`text`))
  //       .map(({ part }) => {
  //         expectTypeOf(part).toEqualTypeOf<TextPart>();
  //         return part;
  //       });
  //   });

  //   it(`should not have chunk property after reduce`, () => {
  //     pipe<MyUIMessage>(mockStream)
  //       .filter(isPartType(`text`))
  //       .reduce()
  //       .map((input) => {
  //         /** After reduce, input only has 'part', not 'chunk' */
  //         expectTypeOf(input).toHaveProperty(`part`);
  //         // @ts-expect-error - chunk should not exist after reduce
  //         input.chunk;
  //         return input.part;
  //       });
  //   });
  // });

  // describe(`match with partType`, () => {
  //   it(`should narrow part.type and chunk types in sub-pipeline`, () => {
  //     pipe<MyUIMessage>(mockStream).match(
  //       isPartType(`text`),
  //       (pipe) =>
  //         pipe.map(({ part, chunk }) => {
  //           expectTypeOf(part).toEqualTypeOf<{ type: `text` }>();
  //           expectTypeOf(chunk).toEqualTypeOf<TextChunk>();
  //           return chunk;
  //         }),
  //     );
  //   });

  //   it(`should narrow part.type and chunk types for multiple types`, () => {
  //     pipe<MyUIMessage>(mockStream).match(
  //       isPartType(`text`, `reasoning`),
  //       (pipe) =>
  //         pipe.map(({ part, chunk }) => {
  //           expectTypeOf(part).toEqualTypeOf<{ type: `text` | `reasoning` }>();
  //           expectTypeOf(chunk).toEqualTypeOf<TextChunk | ReasoningChunk>();
  //           return chunk;
  //         }),
  //     );
  //   });

  //   it(`should narrow part.type and chunk types for tool parts`, () => {
  //     pipe<MyUIMessage>(mockStream).match(
  //       isPartType(`tool-weather`),
  //       (pipe) =>
  //         pipe.map(({ part, chunk }) => {
  //           expectTypeOf(part).toEqualTypeOf<{ type: `tool-weather` }>();
  //           expectTypeOf(chunk).toEqualTypeOf<ToolChunk>();
  //           return chunk;
  //         }),
  //     );
  //   });
  // });

  // describe(`chaining`, () => {
  //   it(`should preserve main pipeline INPUT after match`, () => {
  //     pipe<MyUIMessage>(mockStream)
  //       .match(isPartType(`text`), (pipe) => pipe.map(({ chunk }) => chunk))
  //       .map(({ chunk, part }) => {
  //         /** Main pipeline still has ChunkInput with all types */
  //         expectTypeOf(chunk).toEqualTypeOf<MyUIMessageChunk>();
  //         expectTypeOf(part.type).toBeString();
  //         return chunk;
  //       });
  //   });

  //   it(`should allow multiple match calls`, () => {
  //     pipe<MyUIMessage>(mockStream)
  //       .match(isPartType(`text`), (pipe) => pipe.map(({ chunk }) => chunk))
  //       .match(isPartType(`reasoning`), (pipe) => pipe.map(({ chunk }) => chunk))
  //       .toStream();
  //   });
  // });
});
