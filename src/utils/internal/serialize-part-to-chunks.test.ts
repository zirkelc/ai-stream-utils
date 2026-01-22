import { describe, expect, it } from 'vitest';
import { serializePartToChunks } from './serialize-part-to-chunks.js';
import {
  DATA_CHUNKS,
  DATA_PART,
  DYNAMIC_TOOL_CHUNKS,
  DYNAMIC_TOOL_PART,
  FILE_CHUNKS,
  FILE_PART,
  type MyUIMessage,
  type MyUIMessageChunk,
  REASONING_CHUNKS,
  REASONING_PART,
  SOURCE_DOCUMENT_PART,
  SOURCE_URL_PART,
  TEXT_CHUNKS,
  TEXT_PART,
  TOOL_ERROR_CHUNKS,
  TOOL_ERROR_PART,
  TOOL_PART,
  TOOL_SERVER_CHUNKS,
} from './test-utils.js';

describe('serializePartToChunks', () => {
  it('should serialize text part to chunks', () => {
    const result = serializePartToChunks<MyUIMessage>(TEXT_PART, TEXT_CHUNKS);

    expect(result).toEqual([
      { type: 'text-start', id: '1', providerMetadata: undefined },
      { type: 'text-delta', id: '1', delta: 'Hello World' },
      { type: 'text-end', id: '1', providerMetadata: undefined },
    ]);
  });

  it('should serialize reasoning part to chunks', () => {
    const result = serializePartToChunks<MyUIMessage>(
      REASONING_PART,
      REASONING_CHUNKS,
    );

    expect(result).toEqual([
      { type: 'reasoning-start', id: '2', providerMetadata: undefined },
      { type: 'reasoning-delta', id: '2', delta: 'Thinking...' },
      { type: 'reasoning-end', id: '2', providerMetadata: undefined },
    ]);
  });

  it('should serialize tool part to chunks', () => {
    const result = serializePartToChunks<MyUIMessage>(
      TOOL_PART,
      TOOL_SERVER_CHUNKS,
    );

    // Tool serialization produces: tool-input-start, tool-input-available, tool-output-available
    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({
      type: 'tool-input-start',
      toolCallId: '3',
      toolName: 'weather',
    });
    expect(result[1]).toMatchObject({
      type: 'tool-input-available',
      toolCallId: '3',
      toolName: 'weather',
      input: { location: 'Tokyo' },
    });
    expect(result[2]).toMatchObject({
      type: 'tool-output-available',
      toolCallId: '3',
      output: { location: 'Tokyo', temperature: 72 },
    });
  });

  it('should serialize dynamic tool part to chunks', () => {
    const result = serializePartToChunks<MyUIMessage>(
      DYNAMIC_TOOL_PART,
      DYNAMIC_TOOL_CHUNKS,
    );

    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({
      type: 'tool-input-start',
      toolCallId: '4',
      toolName: 'calculator',
      dynamic: true,
    });
    expect(result[1]).toMatchObject({
      type: 'tool-input-available',
      toolCallId: '4',
      toolName: 'calculator',
      input: { expression: '2+2' },
      dynamic: true,
    });
    expect(result[2]).toMatchObject({
      type: 'tool-output-available',
      toolCallId: '4',
      output: { result: 4 },
      dynamic: true,
    });
  });

  it('should serialize tool error part to chunks', () => {
    const result = serializePartToChunks<MyUIMessage>(
      TOOL_ERROR_PART,
      TOOL_ERROR_CHUNKS,
    );

    // Tool error serialization produces: tool-input-start, tool-output-error
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      type: 'tool-input-start',
      toolCallId: '5',
      toolName: 'failed',
      dynamic: true,
    });
    expect(result[1]).toMatchObject({
      type: 'tool-output-error',
      toolCallId: '5',
      errorText: 'Execution failed',
      dynamic: true,
    });
  });

  it('should serialize source-url part to chunk', () => {
    const result = serializePartToChunks<MyUIMessage>(SOURCE_URL_PART, []);

    expect(result).toEqual([
      {
        type: 'source-url',
        sourceId: 'source-1',
        url: 'https://example.com',
        title: 'Example Source',
        providerMetadata: undefined,
      },
    ]);
  });

  it('should serialize source-document part to chunk', () => {
    const result = serializePartToChunks<MyUIMessage>(SOURCE_DOCUMENT_PART, []);

    expect(result).toEqual([
      {
        type: 'source-document',
        sourceId: 'source-2',
        mediaType: 'application/pdf',
        title: 'Document Title',
        filename: undefined,
        providerMetadata: undefined,
      },
    ]);
  });

  it('should serialize data part to chunk', () => {
    const result = serializePartToChunks<MyUIMessage>(DATA_PART, DATA_CHUNKS);

    expect(result).toEqual([
      {
        type: 'data-weather',
        data: { location: 'Tokyo', temperature: 72 },
      },
    ]);
  });

  it('should serialize file part to chunk', () => {
    const result = serializePartToChunks<MyUIMessage>(FILE_PART, FILE_CHUNKS);

    expect(result).toEqual([
      {
        type: 'file',
        mediaType: 'application/pdf',
        url: 'https://example.com/file.pdf',
        providerMetadata: undefined,
      },
    ]);
  });

  it('should return original chunks for unknown part types', () => {
    const unknownPart = { type: 'unknown-type', data: 'test' } as any;
    const originalChunks = [{ type: 'unknown-chunk', data: 'test' }] as any;

    const result = serializePartToChunks<MyUIMessage>(
      unknownPart,
      originalChunks,
    );

    // Unknown parts return original chunks
    expect(result).toEqual([{ type: 'unknown-chunk', data: 'test' }]);
  });

  it('should extract id from original chunks for text parts', () => {
    const customChunks: MyUIMessageChunk[] = [
      { type: 'text-start', id: 'custom-id' },
      { type: 'text-delta', id: 'custom-id', delta: 'test' },
      { type: 'text-end', id: 'custom-id' },
    ];

    const result = serializePartToChunks<MyUIMessage>(TEXT_PART, customChunks);

    // Should use id from original chunks
    expect(result[0]).toMatchObject({ type: 'text-start', id: 'custom-id' });
    expect(result[1]).toMatchObject({ type: 'text-delta', id: 'custom-id' });
    expect(result[2]).toMatchObject({ type: 'text-end', id: 'custom-id' });
  });

  it('should extract toolCallId from original chunks for tool parts', () => {
    const customChunks: MyUIMessageChunk[] = [
      {
        type: 'tool-input-start',
        toolCallId: 'custom-tool-id',
        toolName: 'test',
      },
    ];

    const result = serializePartToChunks<MyUIMessage>(TOOL_PART, customChunks);

    // Tool parts use their own toolCallId from the part, not from chunks
    expect(result[0]).toMatchObject({
      type: 'tool-input-start',
      toolCallId: '3',
    });
  });
});
