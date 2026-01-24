import { describe, expectTypeOf, it } from 'vitest';
import {
  chunkType,
  partType,
  pipeUIMessageStream,
} from './pipe-ui-message-stream.js';
import type {
  FileChunk,
  MyUIMessage,
  MyUIMessageChunk,
  ReasoningChunk,
  TextChunk,
  TextDeltaChunk,
  // TextPart,
  ToolChunk,
} from './utils/internal/test-utils.js';

/** Mock stream for type tests */
const mockStream = null as unknown as ReadableStream<MyUIMessageChunk>;

describe(`pipeUIMessageStream types`, () => {
  describe(`filter with partType`, () => {
    it(`should narrow part.type and chunk types for single type`, () => {
      pipeUIMessageStream<MyUIMessage>(mockStream)
        .filter(partType(`text`))
        .map(({ part, chunk }) => {
          /** part is now { type: 'text' } not full TextPart */
          expectTypeOf(part).toEqualTypeOf<{ type: `text` }>();
          expectTypeOf(chunk).toEqualTypeOf<TextChunk>();
          return chunk;
        });
    });

    it(`should narrow part.type and chunk types for multiple types`, () => {
      pipeUIMessageStream<MyUIMessage>(mockStream)
        .filter(partType(`text`, `reasoning`))
        .map(({ part, chunk }) => {
          /** part.type is narrowed to 'text' | 'reasoning' */
          expectTypeOf(part).toEqualTypeOf<{ type: `text` | `reasoning` }>();
          expectTypeOf(chunk).toEqualTypeOf<TextChunk | ReasoningChunk>();
          return chunk;
        });
    });

    it(`should narrow part.type and chunk types for tool parts`, () => {
      pipeUIMessageStream<MyUIMessage>(mockStream)
        .filter(partType(`tool-weather`))
        .map(({ part, chunk }) => {
          expectTypeOf(part).toEqualTypeOf<{ type: `tool-weather` }>();
          expectTypeOf(chunk).toEqualTypeOf<ToolChunk>();
          return chunk;
        });
    });

    it(`should narrow part.type and chunk types for file parts`, () => {
      pipeUIMessageStream<MyUIMessage>(mockStream)
        .filter(partType(`file`))
        .map(({ part, chunk }) => {
          expectTypeOf(part).toEqualTypeOf<{ type: `file` }>();
          expectTypeOf(chunk).toEqualTypeOf<FileChunk>();
          return chunk;
        });
    });

    it(`should preserve narrowed types through plain filter predicate`, () => {
      pipeUIMessageStream<MyUIMessage>(mockStream)
        .filter(partType(`text`))
        .filter(({ chunk }) => chunk.type !== `text-start`)
        .map(({ part, chunk }) => {
          /** Plain predicate preserves current types */
          expectTypeOf(part).toEqualTypeOf<{ type: `text` }>();
          expectTypeOf(chunk).toEqualTypeOf<TextChunk>();
          return chunk;
        });
    });
  });

  describe(`filter with chunkType`, () => {
    it(`should narrow chunk type for single type`, () => {
      pipeUIMessageStream<MyUIMessage>(mockStream)
        .filter(chunkType(`text-delta`))
        .map(({ chunk, part }) => {
          /** chunkType narrows chunk but part.type is still all types */
          expectTypeOf(chunk).toEqualTypeOf<TextDeltaChunk>();
          expectTypeOf(part.type).toBeString();
          return chunk;
        });
    });

    it(`should narrow chunk type for multiple types`, () => {
      pipeUIMessageStream<MyUIMessage>(mockStream)
        .filter(chunkType(`text-delta`, `text-end`))
        .map(({ chunk, part }) => {
          /** chunkType narrows to union of specified chunk types */
          expectTypeOf(chunk).toEqualTypeOf<
            Extract<MyUIMessageChunk, { type: `text-delta` | `text-end` }>
          >();
          expectTypeOf(part.type).toBeString();
          return chunk;
        });
    });

    it(`should preserve narrowed chunk type through plain filter predicate`, () => {
      pipeUIMessageStream<MyUIMessage>(mockStream)
        .filter(chunkType(`text-delta`))
        .filter(({ chunk }) => chunk.delta.length > 0)
        .map(({ chunk, part }) => {
          /** Plain predicate preserves narrowed chunk type */
          expectTypeOf(chunk).toEqualTypeOf<TextDeltaChunk>();
          expectTypeOf(part.type).toBeString();
          return chunk;
        });
    });
  });

  // describe(`reduce`, () => {
  //   it(`should transform ChunkInput to PartInput with full part`, () => {
  //     pipeUIMessageStream<MyUIMessage>(mockStream)
  //       .filter(partType(`text`))
  //       .reduce()
  //       .map(({ part }) => {
  //         /** After reduce, part is the full TextPart type */
  //         expectTypeOf(part).toEqualTypeOf<TextPart>();
  //         return part;
  //       });
  //   });

  //   it(`should allow further narrowing with partType after reduce`, () => {
  //     pipeUIMessageStream<MyUIMessage>(mockStream)
  //       .filter(partType(`text`, `reasoning`))
  //       .reduce()
  //       .filter(partType(`text`))
  //       .map(({ part }) => {
  //         expectTypeOf(part).toEqualTypeOf<TextPart>();
  //         return part;
  //       });
  //   });

  //   it(`should not have chunk property after reduce`, () => {
  //     pipeUIMessageStream<MyUIMessage>(mockStream)
  //       .filter(partType(`text`))
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
  //     pipeUIMessageStream<MyUIMessage>(mockStream).match(
  //       partType(`text`),
  //       (pipe) =>
  //         pipe.map(({ part, chunk }) => {
  //           expectTypeOf(part).toEqualTypeOf<{ type: `text` }>();
  //           expectTypeOf(chunk).toEqualTypeOf<TextChunk>();
  //           return chunk;
  //         }),
  //     );
  //   });

  //   it(`should narrow part.type and chunk types for multiple types`, () => {
  //     pipeUIMessageStream<MyUIMessage>(mockStream).match(
  //       partType(`text`, `reasoning`),
  //       (pipe) =>
  //         pipe.map(({ part, chunk }) => {
  //           expectTypeOf(part).toEqualTypeOf<{ type: `text` | `reasoning` }>();
  //           expectTypeOf(chunk).toEqualTypeOf<TextChunk | ReasoningChunk>();
  //           return chunk;
  //         }),
  //     );
  //   });

  //   it(`should narrow part.type and chunk types for tool parts`, () => {
  //     pipeUIMessageStream<MyUIMessage>(mockStream).match(
  //       partType(`tool-weather`),
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
  //     pipeUIMessageStream<MyUIMessage>(mockStream)
  //       .match(partType(`text`), (pipe) => pipe.map(({ chunk }) => chunk))
  //       .map(({ chunk, part }) => {
  //         /** Main pipeline still has ChunkInput with all types */
  //         expectTypeOf(chunk).toEqualTypeOf<MyUIMessageChunk>();
  //         expectTypeOf(part.type).toBeString();
  //         return chunk;
  //       });
  //   });

  //   it(`should allow multiple match calls`, () => {
  //     pipeUIMessageStream<MyUIMessage>(mockStream)
  //       .match(partType(`text`), (pipe) => pipe.map(({ chunk }) => chunk))
  //       .match(partType(`reasoning`), (pipe) => pipe.map(({ chunk }) => chunk))
  //       .toStream();
  //   });
  // });
});
