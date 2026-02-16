import { describe, expectTypeOf, it } from "vitest";
import type {
  DataWeatherChunk,
  DataWeatherPart,
  DynamicToolPart,
  FileChunk,
  FilePart,
  MyUIMessage,
  MyUIMessagePart,
  ReasoningChunk,
  ReasoningPart,
  SourceDocumentChunk,
  SourceDocumentPart,
  SourceUrlChunk,
  SourceUrlPart,
  StartStepChunk,
  StepStartPart,
  TextChunk,
  TextDeltaChunk,
  TextPart,
  ToolChunk,
  ToolWeatherPart,
} from "./test/ui-message.js";
import type {
  ChunkTypeToPartType,
  ContentChunkType,
  ExcludePart,
  ExcludePartType,
  ExtractChunk,
  ExtractChunkForPart,
  ExtractPart,
  InferPartForChunk,
  InferUIMessageChunkType,
  InferUIMessagePart,
  InferUIMessagePartType,
  PartTypeToChunkTypes,
} from "./types.js";

describe(`types`, () => {
  describe(`PartTypeToChunkTypes`, () => {
    it(`should map text to text-start | text-delta | text-end`, () => {
      expectTypeOf<PartTypeToChunkTypes<MyUIMessage, "text">>().toEqualTypeOf<
        "text-start" | "text-delta" | "text-end"
      >();
    });

    it(`should map reasoning to reasoning-start | reasoning-delta | reasoning-end`, () => {
      expectTypeOf<PartTypeToChunkTypes<MyUIMessage, "reasoning">>().toEqualTypeOf<
        "reasoning-start" | "reasoning-delta" | "reasoning-end"
      >();
    });

    it(`should map tool-weather to all tool chunk types`, () => {
      expectTypeOf<PartTypeToChunkTypes<MyUIMessage, "tool-weather">>().toEqualTypeOf<
        | "tool-input-start"
        | "tool-input-delta"
        | "tool-input-available"
        | "tool-input-error"
        | "tool-output-available"
        | "tool-output-error"
        | "tool-output-denied"
        | "tool-approval-request"
      >();
    });

    it(`should map dynamic-tool to all tool chunk types`, () => {
      expectTypeOf<PartTypeToChunkTypes<MyUIMessage, "dynamic-tool">>().toEqualTypeOf<
        | "tool-input-start"
        | "tool-input-delta"
        | "tool-input-available"
        | "tool-input-error"
        | "tool-output-available"
        | "tool-output-error"
        | "tool-output-denied"
        | "tool-approval-request"
      >();
    });

    it(`should map source-url to source-url`, () => {
      expectTypeOf<PartTypeToChunkTypes<MyUIMessage, "source-url">>().toEqualTypeOf<"source-url">();
    });

    it(`should map source-document to source-document`, () => {
      expectTypeOf<
        PartTypeToChunkTypes<MyUIMessage, "source-document">
      >().toEqualTypeOf<"source-document">();
    });

    it(`should map data-weather to data-weather`, () => {
      expectTypeOf<
        PartTypeToChunkTypes<MyUIMessage, "data-weather">
      >().toEqualTypeOf<"data-weather">();
    });

    it(`should map file to file`, () => {
      expectTypeOf<PartTypeToChunkTypes<MyUIMessage, "file">>().toEqualTypeOf<"file">();
    });

    it(`should map step-start to start-step`, () => {
      expectTypeOf<PartTypeToChunkTypes<MyUIMessage, "step-start">>().toEqualTypeOf<"start-step">();
    });
  });

  describe(`ExtractChunkForPart`, () => {
    it(`should extract text chunks for TextPart`, () => {
      expectTypeOf<ExtractChunkForPart<MyUIMessage, TextPart>>().toEqualTypeOf<TextChunk>();
    });

    it(`should extract reasoning chunks for ReasoningPart`, () => {
      expectTypeOf<
        ExtractChunkForPart<MyUIMessage, ReasoningPart>
      >().toEqualTypeOf<ReasoningChunk>();
    });

    it(`should extract tool chunks for ToolWeatherPart`, () => {
      expectTypeOf<ExtractChunkForPart<MyUIMessage, ToolWeatherPart>>().toEqualTypeOf<ToolChunk>();
    });

    it(`should extract tool chunks for DynamicToolPart`, () => {
      expectTypeOf<ExtractChunkForPart<MyUIMessage, DynamicToolPart>>().toEqualTypeOf<ToolChunk>();
    });

    it(`should extract source-url chunk for SourceUrlPart`, () => {
      expectTypeOf<
        ExtractChunkForPart<MyUIMessage, SourceUrlPart>
      >().toEqualTypeOf<SourceUrlChunk>();
    });

    it(`should extract source-document chunk for SourceDocumentPart`, () => {
      expectTypeOf<
        ExtractChunkForPart<MyUIMessage, SourceDocumentPart>
      >().toEqualTypeOf<SourceDocumentChunk>();
    });

    it(`should extract data-weather chunk for DataWeatherPart`, () => {
      expectTypeOf<
        ExtractChunkForPart<MyUIMessage, DataWeatherPart>
      >().toEqualTypeOf<DataWeatherChunk>();
    });

    it(`should extract file chunk for FilePart`, () => {
      expectTypeOf<ExtractChunkForPart<MyUIMessage, FilePart>>().toEqualTypeOf<FileChunk>();
    });

    it(`should extract start-step chunk for StepStartPart`, () => {
      expectTypeOf<
        ExtractChunkForPart<MyUIMessage, StepStartPart>
      >().toEqualTypeOf<StartStepChunk>();
    });

    it(`should handle union of parts`, () => {
      expectTypeOf<ExtractChunkForPart<MyUIMessage, TextPart | ReasoningPart>>().toEqualTypeOf<
        TextChunk | ReasoningChunk
      >();
    });
  });

  describe(`ExtractPart`, () => {
    it(`should extract TextPart for 'text'`, () => {
      expectTypeOf<ExtractPart<MyUIMessage, "text">>().toEqualTypeOf<TextPart>();
    });

    it(`should extract ReasoningPart for 'reasoning'`, () => {
      expectTypeOf<ExtractPart<MyUIMessage, "reasoning">>().toEqualTypeOf<ReasoningPart>();
    });

    it(`should extract ToolWeatherPart for 'tool-weather'`, () => {
      expectTypeOf<ExtractPart<MyUIMessage, "tool-weather">>().toEqualTypeOf<ToolWeatherPart>();
    });

    it(`should extract DynamicToolPart for 'dynamic-tool'`, () => {
      expectTypeOf<ExtractPart<MyUIMessage, "dynamic-tool">>().toEqualTypeOf<DynamicToolPart>();
    });

    it(`should extract SourceUrlPart for 'source-url'`, () => {
      expectTypeOf<ExtractPart<MyUIMessage, "source-url">>().toEqualTypeOf<SourceUrlPart>();
    });

    it(`should extract SourceDocumentPart for 'source-document'`, () => {
      expectTypeOf<
        ExtractPart<MyUIMessage, "source-document">
      >().toEqualTypeOf<SourceDocumentPart>();
    });

    it(`should extract DataWeatherPart for 'data-weather'`, () => {
      expectTypeOf<ExtractPart<MyUIMessage, "data-weather">>().toEqualTypeOf<DataWeatherPart>();
    });

    it(`should extract FilePart for 'file'`, () => {
      expectTypeOf<ExtractPart<MyUIMessage, "file">>().toEqualTypeOf<FilePart>();
    });

    it(`should extract StepStartPart for 'step-start'`, () => {
      expectTypeOf<ExtractPart<MyUIMessage, "step-start">>().toEqualTypeOf<StepStartPart>();
    });

    it(`should extract union for multiple types`, () => {
      expectTypeOf<ExtractPart<MyUIMessage, "text" | "reasoning">>().toEqualTypeOf<
        TextPart | ReasoningPart
      >();
    });
  });

  describe(`InferUIMessagePart`, () => {
    it(`should infer part union from UIMessage`, () => {
      expectTypeOf<InferUIMessagePart<MyUIMessage>>().toEqualTypeOf<MyUIMessagePart>();
    });
  });

  describe(`InferUIMessagePartType`, () => {
    it(`should infer part type strings from UIMessage`, () => {
      expectTypeOf<InferUIMessagePartType<MyUIMessage>>().toEqualTypeOf<MyUIMessagePart["type"]>();
    });
  });

  describe(`InferUIMessageChunkType`, () => {
    it(`should infer chunk type strings from UIMessage`, () => {
      expectTypeOf<InferUIMessageChunkType<MyUIMessage>>().toEqualTypeOf<
        | "start"
        | "finish"
        | "start-step"
        | "finish-step"
        | "abort"
        | "message-metadata"
        | "error"
        | "text-start"
        | "text-delta"
        | "text-end"
        | "reasoning-start"
        | "reasoning-delta"
        | "reasoning-end"
        | "tool-input-start"
        | "tool-input-delta"
        | "tool-input-available"
        | "tool-input-error"
        | "tool-output-available"
        | "tool-output-error"
        | "tool-output-denied"
        | "tool-approval-request"
        | "source-url"
        | "source-document"
        | "data-weather"
        | "file"
      >();
    });
  });

  describe(`ExtractChunk`, () => {
    it(`should extract TextDeltaChunk for 'text-delta'`, () => {
      expectTypeOf<ExtractChunk<MyUIMessage, "text-delta">>().toEqualTypeOf<TextDeltaChunk>();
    });

    it(`should extract TextChunk for union of text chunk types`, () => {
      expectTypeOf<
        ExtractChunk<MyUIMessage, "text-start" | "text-delta" | "text-end">
      >().toEqualTypeOf<TextChunk>();
    });

    it(`should extract ReasoningChunk for union of reasoning chunk types`, () => {
      expectTypeOf<
        ExtractChunk<MyUIMessage, "reasoning-start" | "reasoning-delta" | "reasoning-end">
      >().toEqualTypeOf<ReasoningChunk>();
    });

    it(`should extract ToolChunk for tool chunk types`, () => {
      expectTypeOf<
        ExtractChunk<
          MyUIMessage,
          | "tool-input-start"
          | "tool-input-delta"
          | "tool-input-available"
          | "tool-input-error"
          | "tool-output-available"
          | "tool-output-error"
          | "tool-output-denied"
          | "tool-approval-request"
        >
      >().toEqualTypeOf<ToolChunk>();
    });

    it(`should extract SourceUrlChunk for 'source-url'`, () => {
      expectTypeOf<ExtractChunk<MyUIMessage, "source-url">>().toEqualTypeOf<SourceUrlChunk>();
    });

    it(`should extract SourceDocumentChunk for 'source-document'`, () => {
      expectTypeOf<
        ExtractChunk<MyUIMessage, "source-document">
      >().toEqualTypeOf<SourceDocumentChunk>();
    });

    it(`should extract DataWeatherChunk for 'data-weather'`, () => {
      expectTypeOf<ExtractChunk<MyUIMessage, "data-weather">>().toEqualTypeOf<DataWeatherChunk>();
    });

    it(`should extract FileChunk for 'file'`, () => {
      expectTypeOf<ExtractChunk<MyUIMessage, "file">>().toEqualTypeOf<FileChunk>();
    });

    it(`should extract StartStepChunk for 'start-step'`, () => {
      expectTypeOf<ExtractChunk<MyUIMessage, "start-step">>().toEqualTypeOf<StartStepChunk>();
    });

    it(`should extract union for multiple chunk types`, () => {
      expectTypeOf<ExtractChunk<MyUIMessage, "text-delta" | "reasoning-delta">>().toEqualTypeOf<
        TextDeltaChunk | Extract<ReasoningChunk, { type: "reasoning-delta" }>
      >();
    });
  });

  describe(`ExcludePart`, () => {
    it(`should exclude TextPart for 'text'`, () => {
      expectTypeOf<ExcludePart<MyUIMessage, "text">>().toEqualTypeOf<
        Exclude<MyUIMessagePart, TextPart>
      >();
    });

    it(`should exclude ReasoningPart for 'reasoning'`, () => {
      expectTypeOf<ExcludePart<MyUIMessage, "reasoning">>().toEqualTypeOf<
        Exclude<MyUIMessagePart, ReasoningPart>
      >();
    });

    it(`should exclude ToolWeatherPart for 'tool-weather'`, () => {
      expectTypeOf<ExcludePart<MyUIMessage, "tool-weather">>().toEqualTypeOf<
        Exclude<MyUIMessagePart, ToolWeatherPart>
      >();
    });

    it(`should exclude DynamicToolPart for 'dynamic-tool'`, () => {
      expectTypeOf<ExcludePart<MyUIMessage, "dynamic-tool">>().toEqualTypeOf<
        Exclude<MyUIMessagePart, DynamicToolPart>
      >();
    });

    it(`should exclude SourceUrlPart for 'source-url'`, () => {
      expectTypeOf<ExcludePart<MyUIMessage, "source-url">>().toEqualTypeOf<
        Exclude<MyUIMessagePart, SourceUrlPart>
      >();
    });

    it(`should exclude SourceDocumentPart for 'source-document'`, () => {
      expectTypeOf<ExcludePart<MyUIMessage, "source-document">>().toEqualTypeOf<
        Exclude<MyUIMessagePart, SourceDocumentPart>
      >();
    });

    it(`should exclude DataWeatherPart for 'data-weather'`, () => {
      expectTypeOf<ExcludePart<MyUIMessage, "data-weather">>().toEqualTypeOf<
        Exclude<MyUIMessagePart, DataWeatherPart>
      >();
    });

    it(`should exclude FilePart for 'file'`, () => {
      expectTypeOf<ExcludePart<MyUIMessage, "file">>().toEqualTypeOf<
        Exclude<MyUIMessagePart, FilePart>
      >();
    });

    it(`should exclude StepStartPart for 'step-start'`, () => {
      expectTypeOf<ExcludePart<MyUIMessage, "step-start">>().toEqualTypeOf<
        Exclude<MyUIMessagePart, StepStartPart>
      >();
    });

    it(`should exclude multiple parts for union of types`, () => {
      expectTypeOf<ExcludePart<MyUIMessage, "text" | "reasoning">>().toEqualTypeOf<
        Exclude<MyUIMessagePart, TextPart | ReasoningPart>
      >();
    });
  });

  describe(`ExcludePartType`, () => {
    it(`should return remaining type strings after excluding 'text'`, () => {
      expectTypeOf<ExcludePartType<MyUIMessage, "text">>().toEqualTypeOf<
        Exclude<MyUIMessagePart, TextPart>["type"]
      >();
    });

    it(`should return remaining type strings after excluding 'reasoning'`, () => {
      expectTypeOf<ExcludePartType<MyUIMessage, "reasoning">>().toEqualTypeOf<
        Exclude<MyUIMessagePart, ReasoningPart>["type"]
      >();
    });

    it(`should return remaining type strings after excluding 'tool-weather'`, () => {
      expectTypeOf<ExcludePartType<MyUIMessage, "tool-weather">>().toEqualTypeOf<
        Exclude<MyUIMessagePart, ToolWeatherPart>["type"]
      >();
    });

    it(`should return remaining type strings after excluding 'dynamic-tool'`, () => {
      expectTypeOf<ExcludePartType<MyUIMessage, "dynamic-tool">>().toEqualTypeOf<
        Exclude<MyUIMessagePart, DynamicToolPart>["type"]
      >();
    });

    it(`should return remaining type strings after excluding 'source-url'`, () => {
      expectTypeOf<ExcludePartType<MyUIMessage, "source-url">>().toEqualTypeOf<
        Exclude<MyUIMessagePart, SourceUrlPart>["type"]
      >();
    });

    it(`should return remaining type strings after excluding 'source-document'`, () => {
      expectTypeOf<ExcludePartType<MyUIMessage, "source-document">>().toEqualTypeOf<
        Exclude<MyUIMessagePart, SourceDocumentPart>["type"]
      >();
    });

    it(`should return remaining type strings after excluding 'data-weather'`, () => {
      expectTypeOf<ExcludePartType<MyUIMessage, "data-weather">>().toEqualTypeOf<
        Exclude<MyUIMessagePart, DataWeatherPart>["type"]
      >();
    });

    it(`should return remaining type strings after excluding 'file'`, () => {
      expectTypeOf<ExcludePartType<MyUIMessage, "file">>().toEqualTypeOf<
        Exclude<MyUIMessagePart, FilePart>["type"]
      >();
    });

    it(`should return remaining type strings after excluding 'step-start'`, () => {
      expectTypeOf<ExcludePartType<MyUIMessage, "step-start">>().toEqualTypeOf<
        Exclude<MyUIMessagePart, StepStartPart>["type"]
      >();
    });

    it(`should return remaining type strings after excluding multiple types`, () => {
      expectTypeOf<ExcludePartType<MyUIMessage, "text" | "reasoning">>().toEqualTypeOf<
        Exclude<MyUIMessagePart, TextPart | ReasoningPart>["type"]
      >();
    });
  });

  describe(`ChunkTypeToPartType`, () => {
    it(`should map text-delta to text`, () => {
      expectTypeOf<ChunkTypeToPartType<MyUIMessage, "text-delta">>().toEqualTypeOf<"text">();
    });

    it(`should map reasoning-delta to reasoning`, () => {
      expectTypeOf<
        ChunkTypeToPartType<MyUIMessage, "reasoning-delta">
      >().toEqualTypeOf<"reasoning">();
    });

    it(`should map start (meta chunk) to never`, () => {
      expectTypeOf<ChunkTypeToPartType<MyUIMessage, "start">>().toEqualTypeOf<never>();
    });

    it(`should map union of chunk types to union of part types`, () => {
      expectTypeOf<
        ChunkTypeToPartType<MyUIMessage, "text-delta" | "reasoning-delta">
      >().toEqualTypeOf<"text" | "reasoning">();
    });
  });

  describe(`InferPartForChunk`, () => {
    it(`should infer part type for content chunk`, () => {
      expectTypeOf<InferPartForChunk<MyUIMessage, "text-delta">>().toEqualTypeOf<{
        type: "text";
      }>();
    });

    it(`should infer undefined for meta chunk`, () => {
      expectTypeOf<InferPartForChunk<MyUIMessage, "start">>().toEqualTypeOf<undefined>();
    });

    it(`should infer union part type for multiple content chunks`, () => {
      expectTypeOf<
        InferPartForChunk<MyUIMessage, "text-delta" | "reasoning-delta">
      >().toEqualTypeOf<{
        type: "text" | "reasoning";
      }>();
    });
  });

  describe(`ContentChunkType`, () => {
    it(`should exclude meta chunk types like start, finish, etc.`, () => {
      expectTypeOf<ContentChunkType<MyUIMessage>>().toEqualTypeOf<
        | "start-step"
        | "text-start"
        | "text-delta"
        | "text-end"
        | "reasoning-start"
        | "reasoning-delta"
        | "reasoning-end"
        | "tool-input-start"
        | "tool-input-delta"
        | "tool-input-available"
        | "tool-input-error"
        | "tool-output-available"
        | "tool-output-error"
        | "tool-output-denied"
        | "tool-approval-request"
        | "source-url"
        | "source-document"
        | "data-weather"
        | "file"
      >();
    });

    it(`should not include start`, () => {
      type Test = "start" extends ContentChunkType<MyUIMessage> ? true : false;
      expectTypeOf<Test>().toEqualTypeOf<false>();
    });

    it(`should not include finish`, () => {
      type Test = "finish" extends ContentChunkType<MyUIMessage> ? true : false;
      expectTypeOf<Test>().toEqualTypeOf<false>();
    });

    it(`should include text-delta`, () => {
      type Test = "text-delta" extends ContentChunkType<MyUIMessage> ? true : false;
      expectTypeOf<Test>().toEqualTypeOf<true>();
    });
  });
});
