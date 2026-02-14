import { describe, expectTypeOf, it } from "vitest";
import type {
  DataWeatherChunk,
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
import { isChunkType, isPartType } from "./type-guards.js";

/** Mock stream for type tests */
const mockStream = null as unknown as ReadableStream<MyUIMessageChunk>;

describe(`type-guards`, () => {
  describe(`isChunkType`, () => {
    it(`should narrow chunk to single type`, () => {
      pipe<MyUIMessage>(mockStream)
        .filter(isChunkType(`text-delta`))
        .map(({ chunk, part }) => {
          expectTypeOf(chunk).toEqualTypeOf<TextDeltaChunk>();
          expectTypeOf(part).toEqualTypeOf<{ type: `text` }>();
          return chunk;
        });
    });

    it(`should narrow chunk to union of types`, () => {
      pipe<MyUIMessage>(mockStream)
        .filter(isChunkType([`text-start`, `text-delta`, `text-end`]))
        .map(({ chunk, part }) => {
          expectTypeOf(chunk).toEqualTypeOf<TextChunk>();
          expectTypeOf(part).toEqualTypeOf<{ type: `text` }>();
          return chunk;
        });
    });

    it(`should narrow chunk to different chunk types`, () => {
      pipe<MyUIMessage>(mockStream)
        .filter(isChunkType([`source-url`, `source-document`, `data-weather`]))
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

  describe(`isPartType`, () => {
    it(`should narrow part to single type`, () => {
      pipe<MyUIMessage>(mockStream)
        .filter(isPartType(`text`))
        .map(({ chunk, part }) => {
          expectTypeOf(chunk).toEqualTypeOf<TextChunk>();
          expectTypeOf(part).toEqualTypeOf<{ type: `text` }>();
          return chunk;
        });
    });

    it(`should narrow part to union of types`, () => {
      pipe<MyUIMessage>(mockStream)
        .filter(isPartType([`text`, `reasoning`]))
        .map(({ chunk, part }) => {
          expectTypeOf(chunk).toEqualTypeOf<TextChunk | ReasoningChunk>();
          expectTypeOf(part).toEqualTypeOf<{ type: `text` | `reasoning` }>();
          return chunk;
        });
    });

    it(`should narrow part to tool types`, () => {
      pipe<MyUIMessage>(mockStream)
        .filter(isPartType([`tool-weather`, `dynamic-tool`]))
        .map(({ chunk, part }) => {
          expectTypeOf(chunk).toEqualTypeOf<ToolChunk>();
          expectTypeOf(part).toEqualTypeOf<{ type: `tool-weather` | `dynamic-tool` }>();
          return chunk;
        });
    });
  });
});
