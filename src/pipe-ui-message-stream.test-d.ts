import { describe, expectTypeOf, it } from 'vitest';
import { excludeParts, includeParts } from './filter-ui-message-stream.js';
import {
  isNotPartType,
  isPartType,
  pipeUIMessageStream,
} from './pipe-ui-message-stream.js';
import type {
  FileChunk,
  FilePart,
  MyUIMessage,
  MyUIMessageChunk,
  MyUIMessagePart,
  ReasoningChunk,
  ReasoningPart,
  TextChunk,
  TextPart,
  ToolChunk,
  ToolWeatherPart,
} from './utils/test-utils.js';

/* Mock stream for type tests */
const mockStream = null as unknown as ReadableStream<MyUIMessageChunk>;

describe(`pipeUIMessageStream types`, () => {
  describe(`filter`, () => {
    it(`should narrow part and chunk types with includeParts for single type`, () => {
      pipeUIMessageStream<MyUIMessage>(mockStream)
        .filter(includeParts([`text`]))
        .map(({ part, chunk }) => {
          expectTypeOf(part).toEqualTypeOf<TextPart>();
          expectTypeOf(chunk).toEqualTypeOf<TextChunk>();
          return null;
        });
    });

    it(`should narrow part and chunk types with includeParts for multiple types`, () => {
      pipeUIMessageStream<MyUIMessage>(mockStream)
        .filter(includeParts([`text`, `reasoning`]))
        .map(({ part, chunk }) => {
          expectTypeOf(part).toEqualTypeOf<TextPart | ReasoningPart>();
          expectTypeOf(chunk).toEqualTypeOf<TextChunk | ReasoningChunk>();
          return null;
        });
    });

    it(`should narrow part type with excludeParts for single type`, () => {
      pipeUIMessageStream<MyUIMessage>(mockStream)
        .filter(excludeParts([`file`]))
        .map(({ part }) => {
          expectTypeOf(part).toEqualTypeOf<
            Exclude<MyUIMessagePart, FilePart>
          >();
          return null;
        });
    });

    it(`should narrow part type with excludeParts for multiple types`, () => {
      pipeUIMessageStream<MyUIMessage>(mockStream)
        .filter(excludeParts([`file`, `reasoning`]))
        .map(({ part }) => {
          expectTypeOf(part).toEqualTypeOf<
            Exclude<MyUIMessagePart, FilePart | ReasoningPart>
          >();
          return null;
        });
    });

    it(`should compute intersection when chaining includeParts then excludeParts`, () => {
      pipeUIMessageStream<MyUIMessage>(mockStream)
        .filter(includeParts([`text`, `reasoning`]))
        .filter(excludeParts([`reasoning`]))
        .map(({ part, chunk }) => {
          expectTypeOf(part).toEqualTypeOf<TextPart>();
          expectTypeOf(chunk).toEqualTypeOf<TextChunk>();
          return null;
        });
    });

    it(`should compute intersection when chaining multiple includeParts`, () => {
      pipeUIMessageStream<MyUIMessage>(mockStream)
        .filter(includeParts([`text`, `reasoning`, `file`]))
        .filter(includeParts([`text`, `file`]))
        .map(({ part, chunk }) => {
          expectTypeOf(part).toEqualTypeOf<TextPart | FilePart>();
          expectTypeOf(chunk).toEqualTypeOf<TextChunk | FileChunk>();
          return null;
        });
    });

    it(`should preserve narrowed types through plain filter predicate`, () => {
      pipeUIMessageStream<MyUIMessage>(mockStream)
        .filter(includeParts([`text`]))
        .filter(({ chunk }) => chunk.type !== `text-start`)
        .map(({ part, chunk }) => {
          /* Plain predicate defaults to current types, so intersection is unchanged */
          expectTypeOf(part).toEqualTypeOf<TextPart>();
          expectTypeOf(chunk).toEqualTypeOf<TextChunk>();
          return null;
        });
    });

    it(`should preserve narrowed types through multiple plain filter predicates`, () => {
      pipeUIMessageStream<MyUIMessage>(mockStream)
        .filter(includeParts([`text`, `reasoning`]))
        .filter(({ chunk }) => chunk.type !== `text-start`)
        .filter(({ chunk }) => chunk.type !== `reasoning-start`)
        .map(({ part, chunk }) => {
          expectTypeOf(part).toEqualTypeOf<TextPart | ReasoningPart>();
          expectTypeOf(chunk).toEqualTypeOf<TextChunk | ReasoningChunk>();
          return null;
        });
    });

    it(`should narrow part and chunk types for tool parts`, () => {
      pipeUIMessageStream<MyUIMessage>(mockStream)
        .filter(includeParts([`tool-weather`]))
        .map(({ part, chunk }) => {
          expectTypeOf(part).toEqualTypeOf<ToolWeatherPart>();
          expectTypeOf(chunk).toEqualTypeOf<ToolChunk>();
          return null;
        });
    });

    it(`should narrow part and chunk types for file parts`, () => {
      pipeUIMessageStream<MyUIMessage>(mockStream)
        .filter(includeParts([`file`]))
        .map(({ part, chunk }) => {
          expectTypeOf(part).toEqualTypeOf<FilePart>();
          expectTypeOf(chunk).toEqualTypeOf<FileChunk>();
          return null;
        });
    });
  });

  describe(`match`, () => {
    it(`should narrow part and chunk types with isPartType for single type`, () => {
      pipeUIMessageStream<MyUIMessage>(mockStream).match(
        isPartType(`text`),
        (pipe) =>
          pipe.map(({ part, chunk }) => {
            expectTypeOf(part).toEqualTypeOf<TextPart>();
            expectTypeOf(chunk).toEqualTypeOf<TextChunk>();
            return null;
          }),
      );
    });

    it(`should narrow part and chunk types with isPartType for multiple types`, () => {
      pipeUIMessageStream<MyUIMessage>(mockStream).match(
        isPartType([`text`, `reasoning`]),
        (pipe) =>
          pipe.map(({ part, chunk }) => {
            expectTypeOf(part).toEqualTypeOf<TextPart | ReasoningPart>();
            expectTypeOf(chunk).toEqualTypeOf<TextChunk | ReasoningChunk>();
            return null;
          }),
      );
    });

    it(`should narrow part type with isNotPartType for single type`, () => {
      pipeUIMessageStream<MyUIMessage>(mockStream).match(
        isNotPartType(`text`),
        (pipe) =>
          pipe.map(({ part }) => {
            expectTypeOf(part).toEqualTypeOf<
              Exclude<MyUIMessagePart, TextPart>
            >();
            return null;
          }),
      );
    });

    it(`should narrow part type with isNotPartType for multiple types`, () => {
      pipeUIMessageStream<MyUIMessage>(mockStream).match(
        isNotPartType([`text`, `reasoning`]),
        (pipe) =>
          pipe.map(({ part }) => {
            expectTypeOf(part).toEqualTypeOf<
              Exclude<MyUIMessagePart, TextPart | ReasoningPart>
            >();
            return null;
          }),
      );
    });

    it(`should respect narrowed types from filter in match callback`, () => {
      pipeUIMessageStream<MyUIMessage>(mockStream)
        .filter(includeParts([`text`, `reasoning`]))
        .match(isPartType(`text`), (pipe) =>
          pipe.map(({ part, chunk }) => {
            /* After filter narrows to text | reasoning, match further narrows to text */
            expectTypeOf(part).toEqualTypeOf<TextPart>();
            expectTypeOf(chunk).toEqualTypeOf<TextChunk>();
            return null;
          }),
        );
    });

    it(`should narrow part and chunk types in filter within match pipeline`, () => {
      pipeUIMessageStream<MyUIMessage>(mockStream).match(
        isPartType([`text`, `reasoning`]),
        (pipe) =>
          pipe.filter(includeParts([`text`])).map(({ part, chunk }) => {
            /* MatchPipeline.filter uses typed predicate, narrows matched type */
            expectTypeOf(part).toEqualTypeOf<TextPart>();
            expectTypeOf(chunk).toEqualTypeOf<TextChunk>();
            return null;
          }),
      );
    });

    it(`should preserve narrowed types through plain filter within match pipeline`, () => {
      pipeUIMessageStream<MyUIMessage>(mockStream).match(
        isPartType([`text`, `reasoning`]),
        (pipe) =>
          pipe
            .filter(({ part }) => part.type === `text`)
            .map(({ part, chunk }) => {
              /* MatchPipeline.filter uses plain predicate, preserves matched type */
              expectTypeOf(part).toEqualTypeOf<TextPart | ReasoningPart>();
              expectTypeOf(chunk).toEqualTypeOf<TextChunk | ReasoningChunk>();
              return null;
            }),
      );
    });

    it(`should narrow part and chunk types for tool parts in match`, () => {
      pipeUIMessageStream<MyUIMessage>(mockStream).match(
        isPartType(`tool-weather`),
        (pipe) =>
          pipe.map(({ part, chunk }) => {
            expectTypeOf(part).toEqualTypeOf<ToolWeatherPart>();
            expectTypeOf(chunk).toEqualTypeOf<ToolChunk>();
            return null;
          }),
      );
    });
  });
});
