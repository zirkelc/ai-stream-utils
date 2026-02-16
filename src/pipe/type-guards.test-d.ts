import { describe, expectTypeOf, it } from "vitest";
import type {
  DataWeatherChunk,
  FileChunk,
  MyUIMessage,
  MyUIMessageChunk,
  ReasoningChunk,
  SourceDocumentChunk,
  SourceUrlChunk,
  TextChunk,
  TextDeltaChunk,
  ToolChunk,
} from "../test/ui-message.js";
import { pipe } from "./pipe.js";
import { excludeChunks, excludeParts, includeChunks, includeParts } from "./type-guards.js";

/** Mock stream for type tests */
const mockStream = null as unknown as ReadableStream<MyUIMessageChunk>;

describe(`type-guards`, () => {
  describe(`includeChunks`, () => {
    it(`should narrow chunk to single type`, () => {
      pipe<MyUIMessage>(mockStream)
        .filter(includeChunks(`text-delta`))
        .map(({ chunk, part }) => {
          expectTypeOf(chunk).toEqualTypeOf<TextDeltaChunk>();
          expectTypeOf(part).toEqualTypeOf<{ type: `text` }>();
          return chunk;
        });
    });

    it(`should narrow chunk to union of types`, () => {
      pipe<MyUIMessage>(mockStream)
        .filter(includeChunks([`text-start`, `text-delta`, `text-end`]))
        .map(({ chunk, part }) => {
          expectTypeOf(chunk).toEqualTypeOf<TextChunk>();
          expectTypeOf(part).toEqualTypeOf<{ type: `text` }>();
          return chunk;
        });
    });

    it(`should narrow chunk to different chunk types`, () => {
      pipe<MyUIMessage>(mockStream)
        .filter(includeChunks([`source-url`, `source-document`, `data-weather`]))
        .map(({ chunk, part }) => {
          expectTypeOf(chunk).toEqualTypeOf<
            SourceUrlChunk | SourceDocumentChunk | DataWeatherChunk
          >();
          expectTypeOf(part).toEqualTypeOf<{
            type: `source-url` | `source-document` | `data-weather`;
          }>();
          return chunk;
        });
    });
  });

  describe(`includeParts`, () => {
    it(`should narrow part to single type`, () => {
      pipe<MyUIMessage>(mockStream)
        .filter(includeParts(`text`))
        .map(({ chunk, part }) => {
          expectTypeOf(chunk).toEqualTypeOf<TextChunk>();
          expectTypeOf(part).toEqualTypeOf<{ type: `text` }>();
          return chunk;
        });
    });

    it(`should narrow part to union of types`, () => {
      pipe<MyUIMessage>(mockStream)
        .filter(includeParts([`text`, `reasoning`]))
        .map(({ chunk, part }) => {
          expectTypeOf(chunk).toEqualTypeOf<TextChunk | ReasoningChunk>();
          expectTypeOf(part).toEqualTypeOf<{ type: `text` | `reasoning` }>();
          return chunk;
        });
    });

    it(`should narrow part to tool types`, () => {
      pipe<MyUIMessage>(mockStream)
        .filter(includeParts([`tool-weather`, `dynamic-tool`]))
        .map(({ chunk, part }) => {
          expectTypeOf(chunk).toEqualTypeOf<ToolChunk>();
          expectTypeOf(part).toEqualTypeOf<{
            type: `tool-weather` | `dynamic-tool`;
          }>();
          return chunk;
        });
    });
  });

  describe(`excludeChunks`, () => {
    it(`should exclude single chunk type`, () => {
      pipe<MyUIMessage>(mockStream)
        .filter(excludeChunks(`text-delta`))
        .map(({ chunk, part }) => {
          /** text-delta should be excluded from chunk */
          expectTypeOf<TextDeltaChunk>().not.toExtend<typeof chunk>();
          /** Other content chunks should still be included */
          expectTypeOf<ReasoningChunk>().toExtend<typeof chunk>();
          /** text part should still be in part type since text-start/text-end remain */
          expectTypeOf<{ type: `text` }>().toExtend<typeof part>();
          return chunk;
        });
    });

    it(`should exclude multiple chunk types from same part`, () => {
      pipe<MyUIMessage>(mockStream)
        .filter(excludeChunks([`text-start`, `text-delta`, `text-end`]))
        .map(({ chunk, part }) => {
          /** All text chunks should be excluded */
          expectTypeOf<TextChunk>().not.toExtend<typeof chunk>();
          /** Other content chunks should still be included */
          expectTypeOf<ReasoningChunk>().toExtend<typeof chunk>();
          expectTypeOf<ToolChunk>().toExtend<typeof chunk>();
          /** text part should be excluded since all text chunks are excluded */
          expectTypeOf<{ type: `text` }>().not.toExtend<typeof part>();
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
          /** Other content chunks should still be included */
          expectTypeOf<ReasoningChunk>().toExtend<typeof chunk>();
          expectTypeOf<ToolChunk>().toExtend<typeof chunk>();
          /** text part should be excluded */
          expectTypeOf<{ type: `text` }>().not.toExtend<typeof part>();
          return chunk;
        });
    });

    it(`should exclude multiple part types`, () => {
      pipe<MyUIMessage>(mockStream)
        .filter(excludeParts([`text`, `reasoning`]))
        .map(({ chunk, part }) => {
          /** text and reasoning chunks should be excluded */
          expectTypeOf<TextChunk>().not.toExtend<typeof chunk>();
          expectTypeOf<ReasoningChunk>().not.toExtend<typeof chunk>();
          /** Other content chunks should still be included */
          expectTypeOf<ToolChunk>().toExtend<typeof chunk>();
          expectTypeOf<FileChunk>().toExtend<typeof chunk>();
          /** text and reasoning parts should be excluded */
          expectTypeOf<{ type: `text` }>().not.toExtend<typeof part>();
          expectTypeOf<{ type: `reasoning` }>().not.toExtend<typeof part>();
          return chunk;
        });
    });
  });
});
