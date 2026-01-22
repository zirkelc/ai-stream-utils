import { describe, expectTypeOf, it } from 'vitest';
import type {
  ExcludePart,
  ExcludePartType,
  ExtractChunkForPart,
  ExtractPart,
  PartTypeToChunkTypes,
} from './types.js';
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
  TextPart,
  ToolChunk,
  ToolWeatherPart,
} from './utils/internal/test-utils.js';

describe(`types`, () => {
  describe(`PartTypeToChunkTypes`, () => {
    it(`should map text to text-start | text-delta | text-end`, () => {
      expectTypeOf<PartTypeToChunkTypes<MyUIMessage, 'text'>>().toEqualTypeOf<
        'text-start' | 'text-delta' | 'text-end'
      >();
    });

    it(`should map reasoning to reasoning-start | reasoning-delta | reasoning-end`, () => {
      expectTypeOf<
        PartTypeToChunkTypes<MyUIMessage, 'reasoning'>
      >().toEqualTypeOf<
        'reasoning-start' | 'reasoning-delta' | 'reasoning-end'
      >();
    });

    it(`should map tool-weather to all tool chunk types`, () => {
      expectTypeOf<
        PartTypeToChunkTypes<MyUIMessage, 'tool-weather'>
      >().toEqualTypeOf<
        | 'tool-input-start'
        | 'tool-input-delta'
        | 'tool-input-available'
        | 'tool-input-error'
        | 'tool-output-available'
        | 'tool-output-error'
        | 'tool-output-denied'
        | 'tool-approval-request'
      >();
    });

    it(`should map dynamic-tool to all tool chunk types`, () => {
      expectTypeOf<
        PartTypeToChunkTypes<MyUIMessage, 'dynamic-tool'>
      >().toEqualTypeOf<
        | 'tool-input-start'
        | 'tool-input-delta'
        | 'tool-input-available'
        | 'tool-input-error'
        | 'tool-output-available'
        | 'tool-output-error'
        | 'tool-output-denied'
        | 'tool-approval-request'
      >();
    });

    it(`should map source-url to source-url`, () => {
      expectTypeOf<
        PartTypeToChunkTypes<MyUIMessage, 'source-url'>
      >().toEqualTypeOf<'source-url'>();
    });

    it(`should map source-document to source-document`, () => {
      expectTypeOf<
        PartTypeToChunkTypes<MyUIMessage, 'source-document'>
      >().toEqualTypeOf<'source-document'>();
    });

    it(`should map data-weather to data-weather`, () => {
      expectTypeOf<
        PartTypeToChunkTypes<MyUIMessage, 'data-weather'>
      >().toEqualTypeOf<'data-weather'>();
    });

    it(`should map file to file`, () => {
      expectTypeOf<
        PartTypeToChunkTypes<MyUIMessage, 'file'>
      >().toEqualTypeOf<'file'>();
    });

    it(`should map step-start to start-step`, () => {
      expectTypeOf<
        PartTypeToChunkTypes<MyUIMessage, 'step-start'>
      >().toEqualTypeOf<'start-step'>();
    });
  });

  describe(`ExtractChunkForPart`, () => {
    it(`should extract text chunks for TextPart`, () => {
      expectTypeOf<
        ExtractChunkForPart<MyUIMessage, TextPart>
      >().toEqualTypeOf<TextChunk>();
    });

    it(`should extract reasoning chunks for ReasoningPart`, () => {
      expectTypeOf<
        ExtractChunkForPart<MyUIMessage, ReasoningPart>
      >().toEqualTypeOf<ReasoningChunk>();
    });

    it(`should extract tool chunks for ToolWeatherPart`, () => {
      expectTypeOf<
        ExtractChunkForPart<MyUIMessage, ToolWeatherPart>
      >().toEqualTypeOf<ToolChunk>();
    });

    it(`should extract tool chunks for DynamicToolPart`, () => {
      expectTypeOf<
        ExtractChunkForPart<MyUIMessage, DynamicToolPart>
      >().toEqualTypeOf<ToolChunk>();
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
      expectTypeOf<
        ExtractChunkForPart<MyUIMessage, FilePart>
      >().toEqualTypeOf<FileChunk>();
    });

    it(`should extract start-step chunk for StepStartPart`, () => {
      expectTypeOf<
        ExtractChunkForPart<MyUIMessage, StepStartPart>
      >().toEqualTypeOf<StartStepChunk>();
    });

    it(`should handle union of parts`, () => {
      expectTypeOf<
        ExtractChunkForPart<MyUIMessage, TextPart | ReasoningPart>
      >().toEqualTypeOf<TextChunk | ReasoningChunk>();
    });
  });

  describe(`ExtractPart`, () => {
    it(`should extract TextPart for 'text'`, () => {
      expectTypeOf<
        ExtractPart<MyUIMessage, 'text'>
      >().toEqualTypeOf<TextPart>();
    });

    it(`should extract ReasoningPart for 'reasoning'`, () => {
      expectTypeOf<
        ExtractPart<MyUIMessage, 'reasoning'>
      >().toEqualTypeOf<ReasoningPart>();
    });

    it(`should extract ToolWeatherPart for 'tool-weather'`, () => {
      expectTypeOf<
        ExtractPart<MyUIMessage, 'tool-weather'>
      >().toEqualTypeOf<ToolWeatherPart>();
    });

    it(`should extract DynamicToolPart for 'dynamic-tool'`, () => {
      expectTypeOf<
        ExtractPart<MyUIMessage, 'dynamic-tool'>
      >().toEqualTypeOf<DynamicToolPart>();
    });

    it(`should extract SourceUrlPart for 'source-url'`, () => {
      expectTypeOf<
        ExtractPart<MyUIMessage, 'source-url'>
      >().toEqualTypeOf<SourceUrlPart>();
    });

    it(`should extract SourceDocumentPart for 'source-document'`, () => {
      expectTypeOf<
        ExtractPart<MyUIMessage, 'source-document'>
      >().toEqualTypeOf<SourceDocumentPart>();
    });

    it(`should extract DataWeatherPart for 'data-weather'`, () => {
      expectTypeOf<
        ExtractPart<MyUIMessage, 'data-weather'>
      >().toEqualTypeOf<DataWeatherPart>();
    });

    it(`should extract FilePart for 'file'`, () => {
      expectTypeOf<
        ExtractPart<MyUIMessage, 'file'>
      >().toEqualTypeOf<FilePart>();
    });

    it(`should extract StepStartPart for 'step-start'`, () => {
      expectTypeOf<
        ExtractPart<MyUIMessage, 'step-start'>
      >().toEqualTypeOf<StepStartPart>();
    });

    it(`should extract union for multiple types`, () => {
      expectTypeOf<
        ExtractPart<MyUIMessage, 'text' | 'reasoning'>
      >().toEqualTypeOf<TextPart | ReasoningPart>();
    });
  });

  describe(`ExcludePart`, () => {
    it(`should exclude TextPart for 'text'`, () => {
      expectTypeOf<ExcludePart<MyUIMessage, 'text'>>().toEqualTypeOf<
        Exclude<MyUIMessagePart, TextPart>
      >();
    });

    it(`should exclude ReasoningPart for 'reasoning'`, () => {
      expectTypeOf<ExcludePart<MyUIMessage, 'reasoning'>>().toEqualTypeOf<
        Exclude<MyUIMessagePart, ReasoningPart>
      >();
    });

    it(`should exclude ToolWeatherPart for 'tool-weather'`, () => {
      expectTypeOf<ExcludePart<MyUIMessage, 'tool-weather'>>().toEqualTypeOf<
        Exclude<MyUIMessagePart, ToolWeatherPart>
      >();
    });

    it(`should exclude DynamicToolPart for 'dynamic-tool'`, () => {
      expectTypeOf<ExcludePart<MyUIMessage, 'dynamic-tool'>>().toEqualTypeOf<
        Exclude<MyUIMessagePart, DynamicToolPart>
      >();
    });

    it(`should exclude SourceUrlPart for 'source-url'`, () => {
      expectTypeOf<ExcludePart<MyUIMessage, 'source-url'>>().toEqualTypeOf<
        Exclude<MyUIMessagePart, SourceUrlPart>
      >();
    });

    it(`should exclude SourceDocumentPart for 'source-document'`, () => {
      expectTypeOf<ExcludePart<MyUIMessage, 'source-document'>>().toEqualTypeOf<
        Exclude<MyUIMessagePart, SourceDocumentPart>
      >();
    });

    it(`should exclude DataWeatherPart for 'data-weather'`, () => {
      expectTypeOf<ExcludePart<MyUIMessage, 'data-weather'>>().toEqualTypeOf<
        Exclude<MyUIMessagePart, DataWeatherPart>
      >();
    });

    it(`should exclude FilePart for 'file'`, () => {
      expectTypeOf<ExcludePart<MyUIMessage, 'file'>>().toEqualTypeOf<
        Exclude<MyUIMessagePart, FilePart>
      >();
    });

    it(`should exclude StepStartPart for 'step-start'`, () => {
      expectTypeOf<ExcludePart<MyUIMessage, 'step-start'>>().toEqualTypeOf<
        Exclude<MyUIMessagePart, StepStartPart>
      >();
    });

    it(`should exclude multiple parts for union of types`, () => {
      expectTypeOf<
        ExcludePart<MyUIMessage, 'text' | 'reasoning'>
      >().toEqualTypeOf<Exclude<MyUIMessagePart, TextPart | ReasoningPart>>();
    });
  });

  describe(`ExcludePartType`, () => {
    it(`should return remaining type strings after excluding 'text'`, () => {
      expectTypeOf<ExcludePartType<MyUIMessage, 'text'>>().toEqualTypeOf<
        Exclude<MyUIMessagePart, TextPart>['type']
      >();
    });

    it(`should return remaining type strings after excluding 'reasoning'`, () => {
      expectTypeOf<ExcludePartType<MyUIMessage, 'reasoning'>>().toEqualTypeOf<
        Exclude<MyUIMessagePart, ReasoningPart>['type']
      >();
    });

    it(`should return remaining type strings after excluding 'tool-weather'`, () => {
      expectTypeOf<
        ExcludePartType<MyUIMessage, 'tool-weather'>
      >().toEqualTypeOf<Exclude<MyUIMessagePart, ToolWeatherPart>['type']>();
    });

    it(`should return remaining type strings after excluding 'dynamic-tool'`, () => {
      expectTypeOf<
        ExcludePartType<MyUIMessage, 'dynamic-tool'>
      >().toEqualTypeOf<Exclude<MyUIMessagePart, DynamicToolPart>['type']>();
    });

    it(`should return remaining type strings after excluding 'source-url'`, () => {
      expectTypeOf<ExcludePartType<MyUIMessage, 'source-url'>>().toEqualTypeOf<
        Exclude<MyUIMessagePart, SourceUrlPart>['type']
      >();
    });

    it(`should return remaining type strings after excluding 'source-document'`, () => {
      expectTypeOf<
        ExcludePartType<MyUIMessage, 'source-document'>
      >().toEqualTypeOf<Exclude<MyUIMessagePart, SourceDocumentPart>['type']>();
    });

    it(`should return remaining type strings after excluding 'data-weather'`, () => {
      expectTypeOf<
        ExcludePartType<MyUIMessage, 'data-weather'>
      >().toEqualTypeOf<Exclude<MyUIMessagePart, DataWeatherPart>['type']>();
    });

    it(`should return remaining type strings after excluding 'file'`, () => {
      expectTypeOf<ExcludePartType<MyUIMessage, 'file'>>().toEqualTypeOf<
        Exclude<MyUIMessagePart, FilePart>['type']
      >();
    });

    it(`should return remaining type strings after excluding 'step-start'`, () => {
      expectTypeOf<ExcludePartType<MyUIMessage, 'step-start'>>().toEqualTypeOf<
        Exclude<MyUIMessagePart, StepStartPart>['type']
      >();
    });

    it(`should return remaining type strings after excluding multiple types`, () => {
      expectTypeOf<
        ExcludePartType<MyUIMessage, 'text' | 'reasoning'>
      >().toEqualTypeOf<
        Exclude<MyUIMessagePart, TextPart | ReasoningPart>['type']
      >();
    });
  });
});
