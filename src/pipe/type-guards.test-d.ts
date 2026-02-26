import { describe, expectTypeOf, it } from "vitest";
import type {
  DataWeatherChunk,
  FileChunk,
  FinishChunk,
  MyUIMessage,
  MyUIMessageChunk,
  ReasoningChunk,
  SourceDocumentChunk,
  SourceUrlChunk,
  StartChunk,
  TextChunk,
  TextDeltaChunk,
  ToolChunk,
} from "../test/ui-message.js";
import { pipe } from "./pipe.js";
import {
  chunkType,
  excludeChunks,
  excludeParts,
  excludeTools,
  includeChunks,
  includeParts,
  includeTools,
  partType,
} from "./type-guards.js";

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

  describe(`chunkType`, () => {
    it(`should narrow to single content chunk type`, () => {
      pipe<MyUIMessage>(mockStream).on(chunkType(`text-delta`), ({ chunk, part }) => {
        expectTypeOf(chunk).toEqualTypeOf<TextDeltaChunk>();
        expectTypeOf(part).toEqualTypeOf<{ type: `text` }>();
      });
    });

    it(`should narrow to multiple content chunk types`, () => {
      pipe<MyUIMessage>(mockStream).on(
        chunkType([`text-start`, `text-delta`, `text-end`]),
        ({ chunk, part }) => {
          expectTypeOf(chunk).toEqualTypeOf<TextChunk>();
          expectTypeOf(part).toEqualTypeOf<{ type: `text` }>();
        },
      );
    });

    it(`should narrow to single meta chunk type`, () => {
      pipe<MyUIMessage>(mockStream).on(chunkType(`start`), ({ chunk, part }) => {
        expectTypeOf(chunk).toEqualTypeOf<StartChunk>();
        expectTypeOf(part).toEqualTypeOf<undefined>();
      });
    });

    it(`should narrow to multiple meta chunk types`, () => {
      pipe<MyUIMessage>(mockStream).on(chunkType([`start`, `finish`]), ({ chunk, part }) => {
        expectTypeOf(chunk).toEqualTypeOf<StartChunk | FinishChunk>();
        expectTypeOf(part).toEqualTypeOf<undefined>();
      });
    });

    it(`should narrow to mixed content and meta chunk types`, () => {
      pipe<MyUIMessage>(mockStream).on(
        chunkType([`text-delta`, `start`, `finish`]),
        ({ chunk, part }) => {
          expectTypeOf(chunk).toEqualTypeOf<TextDeltaChunk | StartChunk | FinishChunk>();
          expectTypeOf(part).toEqualTypeOf<{ type: `text` } | undefined>();
        },
      );
    });
  });

  describe(`partType`, () => {
    it(`should narrow to single part type`, () => {
      pipe<MyUIMessage>(mockStream).on(partType(`text`), ({ chunk, part }) => {
        expectTypeOf(chunk).toEqualTypeOf<TextChunk>();
        expectTypeOf(part).toEqualTypeOf<{ type: `text` }>();
      });
    });

    it(`should narrow to multiple part types`, () => {
      pipe<MyUIMessage>(mockStream).on(partType([`text`, `reasoning`]), ({ chunk, part }) => {
        expectTypeOf(chunk).toEqualTypeOf<TextChunk | ReasoningChunk>();
        expectTypeOf(part).toEqualTypeOf<{ type: `text` | `reasoning` }>();
      });
    });

    it(`should narrow to tool part types`, () => {
      pipe<MyUIMessage>(mockStream).on(
        partType([`tool-weather`, `dynamic-tool`]),
        ({ chunk, part }) => {
          expectTypeOf(chunk).toEqualTypeOf<ToolChunk>();
          expectTypeOf(part).toEqualTypeOf<{ type: `tool-weather` | `dynamic-tool` }>();
        },
      );
    });
  });

  describe(`excludeTools`, () => {
    it(`should exclude all tool chunks when called without arguments`, () => {
      pipe<MyUIMessage>(mockStream)
        .filter(excludeTools())
        .map(({ chunk, part }) => {
          /** Tool chunks should be excluded */
          expectTypeOf<ToolChunk>().not.toExtend<typeof chunk>();
          /** Other content chunks should still be included */
          expectTypeOf<TextChunk>().toExtend<typeof chunk>();
          expectTypeOf<ReasoningChunk>().toExtend<typeof chunk>();
          expectTypeOf<FileChunk>().toExtend<typeof chunk>();
          /** Tool part types should be excluded */
          expectTypeOf<{ type: `tool-weather` }>().not.toExtend<typeof part>();
          expectTypeOf<{ type: `dynamic-tool` }>().not.toExtend<typeof part>();
          /** Other part types should be included */
          expectTypeOf<{ type: `text` }>().toExtend<typeof part>();
          expectTypeOf<{ type: `reasoning` }>().toExtend<typeof part>();
          return chunk;
        });
    });

    it(`should exclude specific tool when called with single tool name`, () => {
      pipe<MyUIMessage>(mockStream)
        .filter(excludeTools(`weather`))
        .map(({ chunk, part }) => {
          /** tool-weather part should be excluded */
          expectTypeOf<{ type: `tool-weather` }>().not.toExtend<typeof part>();
          /** Other part types should be included */
          expectTypeOf<{ type: `text` }>().toExtend<typeof part>();
          expectTypeOf<{ type: `dynamic-tool` }>().toExtend<typeof part>();
          return chunk;
        });
    });

    it(`should exclude multiple tools when called with array of tool names`, () => {
      pipe<MyUIMessage>(mockStream)
        .filter(excludeTools([`weather`]))
        .map(({ chunk, part }) => {
          /** Specified tool parts should be excluded */
          expectTypeOf<{ type: `tool-weather` }>().not.toExtend<typeof part>();
          /** Other part types should be included */
          expectTypeOf<{ type: `text` }>().toExtend<typeof part>();
          expectTypeOf<{ type: `dynamic-tool` }>().toExtend<typeof part>();
          return chunk;
        });
    });

    it(`should not allow invalid tool names`, () => {
      // @ts-expect-error - invalid tool name should not be allowed
      pipe<MyUIMessage>(mockStream).filter(excludeTools(`invalid-tool`));
    });
  });

  describe(`includeTools`, () => {
    it(`should be no-op when called without arguments (all chunks pass)`, () => {
      pipe<MyUIMessage>(mockStream)
        .filter(includeTools())
        .map(({ chunk, part }) => {
          /** All content chunks should still be included */
          expectTypeOf<TextChunk>().toExtend<typeof chunk>();
          expectTypeOf<ReasoningChunk>().toExtend<typeof chunk>();
          expectTypeOf<ToolChunk>().toExtend<typeof chunk>();
          expectTypeOf<FileChunk>().toExtend<typeof chunk>();
          /** All part types should be included */
          expectTypeOf<{ type: `text` }>().toExtend<typeof part>();
          expectTypeOf<{ type: `tool-weather` }>().toExtend<typeof part>();
          expectTypeOf<{ type: `dynamic-tool` }>().toExtend<typeof part>();
          return chunk;
        });
    });

    it(`should include specific tool when called with single tool name`, () => {
      pipe<MyUIMessage>(mockStream)
        .filter(includeTools(`weather`))
        .map(({ chunk, part }) => {
          /** Non-tool chunks should still be included */
          expectTypeOf<TextChunk>().toExtend<typeof chunk>();
          expectTypeOf<ReasoningChunk>().toExtend<typeof chunk>();
          expectTypeOf<FileChunk>().toExtend<typeof chunk>();
          /** tool-weather part should be included */
          expectTypeOf<{ type: `tool-weather` }>().toExtend<typeof part>();
          /** Non-tool part types should be included */
          expectTypeOf<{ type: `text` }>().toExtend<typeof part>();
          /** Other tools should be excluded */
          expectTypeOf<{ type: `dynamic-tool` }>().not.toExtend<typeof part>();
          return chunk;
        });
    });

    it(`should include multiple tools when called with array of tool names`, () => {
      pipe<MyUIMessage>(mockStream)
        .filter(includeTools([`weather`]))
        .map(({ chunk, part }) => {
          /** Non-tool chunks should still be included */
          expectTypeOf<TextChunk>().toExtend<typeof chunk>();
          expectTypeOf<ReasoningChunk>().toExtend<typeof chunk>();
          /** Specified tool parts should be included */
          expectTypeOf<{ type: `tool-weather` }>().toExtend<typeof part>();
          /** Non-tool part types should be included */
          expectTypeOf<{ type: `text` }>().toExtend<typeof part>();
          /** Other tools should be excluded */
          expectTypeOf<{ type: `dynamic-tool` }>().not.toExtend<typeof part>();
          return chunk;
        });
    });

    it(`should not allow invalid tool names`, () => {
      // @ts-expect-error - invalid tool name should not be allowed
      pipe<MyUIMessage>(mockStream).filter(includeTools(`invalid-tool`));
    });
  });
});
