import { describe, expect, it } from "vitest";
import {
  DATA_PART,
  DYNAMIC_TOOL_PART,
  FILE_PART,
  type MyUIMessage,
  REASONING_PART,
  SOURCE_DOCUMENT_PART,
  SOURCE_URL_PART,
  TEXT_PART,
  TOOL_ERROR_PART,
  TOOL_PART,
} from "../test/ui-message.js";
import { serializePartToChunks } from "./serialize-part-to-chunks.js";

describe("serializePartToChunks", () => {
  it("should serialize text part to chunks", () => {
    // Act
    const result = serializePartToChunks<MyUIMessage>(TEXT_PART);

    // Assert
    expect(result.length).toBe(3);
    expect(result[0]).toMatchObject({ type: "text-start", providerMetadata: undefined });
    expect(result[1]).toMatchObject({ type: "text-delta", delta: "Hello World" });
    expect(result[2]).toMatchObject({ type: "text-end", providerMetadata: undefined });
    // All chunks should have the same generated ID
    const id0 = (result[0] as any).id;
    const id1 = (result[1] as any).id;
    const id2 = (result[2] as any).id;
    expect(id0).toBe(id1);
    expect(id1).toBe(id2);
    expect(id0).toMatch(/^aitxt-/);
  });

  it("should serialize reasoning part to chunks", () => {
    // Act
    const result = serializePartToChunks<MyUIMessage>(REASONING_PART);

    // Assert
    expect(result.length).toBe(3);
    expect(result[0]).toMatchObject({ type: "reasoning-start", providerMetadata: undefined });
    expect(result[1]).toMatchObject({ type: "reasoning-delta", delta: "Thinking..." });
    expect(result[2]).toMatchObject({ type: "reasoning-end", providerMetadata: undefined });
    // All chunks should have the same generated ID
    const id0 = (result[0] as any).id;
    const id1 = (result[1] as any).id;
    const id2 = (result[2] as any).id;
    expect(id0).toBe(id1);
    expect(id1).toBe(id2);
    expect(id0).toMatch(/^aitxt-/);
  });

  it("should serialize tool part to chunks", () => {
    // Act
    const result = serializePartToChunks<MyUIMessage>(TOOL_PART);

    // Assert
    expect(result.length).toBe(3);
    expect(result[0]).toMatchObject({
      type: "tool-input-start",
      toolCallId: "3",
      toolName: "weather",
    });
    expect(result[1]).toMatchObject({
      type: "tool-input-available",
      toolCallId: "3",
      toolName: "weather",
      input: { location: "Tokyo" },
    });
    expect(result[2]).toMatchObject({
      type: "tool-output-available",
      toolCallId: "3",
      output: { location: "Tokyo", temperature: 72 },
    });
  });

  it("should serialize dynamic tool part to chunks", () => {
    // Act
    const result = serializePartToChunks<MyUIMessage>(DYNAMIC_TOOL_PART);

    // Assert
    expect(result.length).toBe(3);
    expect(result[0]).toMatchObject({
      type: "tool-input-start",
      toolCallId: "4",
      toolName: "calculator",
      dynamic: true,
    });
    expect(result[1]).toMatchObject({
      type: "tool-input-available",
      toolCallId: "4",
      toolName: "calculator",
      input: { expression: "2+2" },
      dynamic: true,
    });
    expect(result[2]).toMatchObject({
      type: "tool-output-available",
      toolCallId: "4",
      output: { result: 4 },
      dynamic: true,
    });
  });

  it("should serialize tool error part to chunks", () => {
    // Act
    const result = serializePartToChunks<MyUIMessage>(TOOL_ERROR_PART);

    // Assert
    expect(result.length).toBe(2);
    expect(result[0]).toMatchObject({
      type: "tool-input-start",
      toolCallId: "5",
      toolName: "failed",
      dynamic: true,
    });
    expect(result[1]).toMatchObject({
      type: "tool-output-error",
      toolCallId: "5",
      errorText: "Execution failed",
      dynamic: true,
    });
  });

  it("should serialize source-url part to chunk", () => {
    // Act
    const result = serializePartToChunks<MyUIMessage>(SOURCE_URL_PART);

    // Assert
    expect(result).toEqual([
      {
        type: "source-url",
        sourceId: "source-1",
        url: "https://example.com",
        title: "Example Source",
        providerMetadata: undefined,
      },
    ]);
  });

  it("should serialize source-document part to chunk", () => {
    // Act
    const result = serializePartToChunks<MyUIMessage>(SOURCE_DOCUMENT_PART);

    // Assert
    expect(result).toEqual([
      {
        type: "source-document",
        sourceId: "source-2",
        mediaType: "application/pdf",
        title: "Document Title",
        filename: undefined,
        providerMetadata: undefined,
      },
    ]);
  });

  it("should serialize data part to chunk", () => {
    // Act
    const result = serializePartToChunks<MyUIMessage>(DATA_PART);

    // Assert
    expect(result).toEqual([
      {
        type: "data-weather",
        data: { location: "Tokyo", temperature: 72 },
      },
    ]);
  });

  it("should serialize file part to chunk", () => {
    // Act
    const result = serializePartToChunks<MyUIMessage>(FILE_PART);

    // Assert
    expect(result).toEqual([
      {
        type: "file",
        mediaType: "application/pdf",
        url: "https://example.com/file.pdf",
        providerMetadata: undefined,
      },
    ]);
  });

  it("should throw for unknown part types", () => {
    // Arrange
    const unknownPart = { type: "unknown-type", data: "test" } as any;

    // Act & Assert
    expect(() => serializePartToChunks<MyUIMessage>(unknownPart)).toThrow();
  });

  it("should generate unique IDs for different text parts", () => {
    // Act
    const result1 = serializePartToChunks<MyUIMessage>(TEXT_PART);
    const result2 = serializePartToChunks<MyUIMessage>(TEXT_PART);

    // Assert
    expect((result1[0] as any).id).not.toBe((result2[0] as any).id);
  });
});
