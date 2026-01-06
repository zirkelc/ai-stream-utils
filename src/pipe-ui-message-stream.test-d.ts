import { describe, expectTypeOf, it } from 'vitest';
import { excludeParts, includeParts } from './filter-ui-message-stream.js';
import {
  isNotPartType,
  isPartType,
  pipeUIMessageStream,
} from './pipe-ui-message-stream.js';
import type {
  MyUIMessage,
  MyUIMessageChunk,
  MyUIMessagePart,
} from './utils/test-utils.js';

type TextPart = Extract<MyUIMessagePart, { type: 'text' }>;
type ReasoningPart = Extract<MyUIMessagePart, { type: 'reasoning' }>;
type FilePart = Extract<MyUIMessagePart, { type: 'file' }>;

/* Mock stream for type tests */
const mockStream = null as unknown as ReadableStream<MyUIMessageChunk>;

describe(`pipeUIMessageStream types`, () => {
  describe(`filter`, () => {
    it(`should narrow part type with includeParts for single type`, () => {
      pipeUIMessageStream<MyUIMessage>(mockStream)
        .filter(includeParts([`text`]))
        .map(({ part }) => {
          expectTypeOf(part).toEqualTypeOf<TextPart>();
          return null;
        });
    });

    it(`should narrow part type with includeParts for multiple types`, () => {
      pipeUIMessageStream<MyUIMessage>(mockStream)
        .filter(includeParts([`text`, `reasoning`]))
        .map(({ part }) => {
          expectTypeOf(part).toEqualTypeOf<TextPart | ReasoningPart>();
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
        .map(({ part }) => {
          expectTypeOf(part).toEqualTypeOf<TextPart>();
          return null;
        });
    });

    it(`should compute intersection when chaining multiple includeParts`, () => {
      pipeUIMessageStream<MyUIMessage>(mockStream)
        .filter(includeParts([`text`, `reasoning`, `file`]))
        .filter(includeParts([`text`, `file`]))
        .map(({ part }) => {
          expectTypeOf(part).toEqualTypeOf<TextPart | FilePart>();
          return null;
        });
    });

    it(`should preserve narrowed type through plain filter predicate`, () => {
      pipeUIMessageStream<MyUIMessage>(mockStream)
        .filter(includeParts([`text`]))
        .filter(({ chunk }) => chunk.type !== `text-start`)
        .map(({ part }) => {
          /* Plain predicate defaults to current PART, so intersection is unchanged */
          expectTypeOf(part).toEqualTypeOf<TextPart>();
          return null;
        });
    });

    it(`should preserve narrowed type through multiple plain filter predicates`, () => {
      pipeUIMessageStream<MyUIMessage>(mockStream)
        .filter(includeParts([`text`, `reasoning`]))
        .filter(({ chunk }) => chunk.type !== `text-start`)
        .filter(({ chunk }) => chunk.type !== `reasoning-start`)
        .map(({ part }) => {
          expectTypeOf(part).toEqualTypeOf<TextPart | ReasoningPart>();
          return null;
        });
    });
  });

  describe(`match`, () => {
    it(`should narrow part type with isPartType for single type`, () => {
      pipeUIMessageStream<MyUIMessage>(mockStream).match(
        isPartType(`text`),
        (pipe) =>
          pipe.map(({ part }) => {
            expectTypeOf(part).toEqualTypeOf<TextPart>();
            return null;
          }),
      );
    });

    it(`should narrow part type with isPartType for multiple types`, () => {
      pipeUIMessageStream<MyUIMessage>(mockStream).match(
        isPartType([`text`, `reasoning`]),
        (pipe) =>
          pipe.map(({ part }) => {
            expectTypeOf(part).toEqualTypeOf<TextPart | ReasoningPart>();
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

    it(`should respect narrowed type from filter in match callback`, () => {
      pipeUIMessageStream<MyUIMessage>(mockStream)
        .filter(includeParts([`text`, `reasoning`]))
        .match(isPartType(`text`), (pipe) =>
          pipe.map(({ part }) => {
            /* After filter narrows to text | reasoning, match further narrows to text */
            expectTypeOf(part).toEqualTypeOf<TextPart>();
            return null;
          }),
        );
    });

    it(`should narrow part type in filter within match pipeline`, () => {
      pipeUIMessageStream<MyUIMessage>(mockStream).match(
        isPartType([`text`, `reasoning`]),
        (pipe) =>
          pipe.filter(includeParts([`text`])).map(({ part }) => {
            /* MatchPipeline.filter uses typed predicate, narrows matched type */
            expectTypeOf(part).toEqualTypeOf<TextPart>();
            return null;
          }),
      );
    });

    it(`should preserve narrowed type through plain filter within match pipeline`, () => {
      pipeUIMessageStream<MyUIMessage>(mockStream).match(
        isPartType([`text`, `reasoning`]),
        (pipe) =>
          pipe
            .filter(({ part }) => part.type === `text`)
            .map(({ part }) => {
              /* MatchPipeline.filter uses plain predicate, preserves matched type */
              expectTypeOf(part).toEqualTypeOf<TextPart | ReasoningPart>();
              return null;
            }),
      );
    });
  });
});
