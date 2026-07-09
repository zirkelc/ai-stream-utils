import { UIChunks } from "ai-test-kit/ui";
import { describe, expect, it } from "vitest";
import type { MyUIMessage, MyUIMessageChunk } from "../test/ui-message.js";
import { createToolPartTypeMap, getPartTypeFromChunk } from "./get-part-type-from-chunk.js";

/** Resolves a chunk against a fresh map, for chunks that need no prior state. */
function partTypeOf(chunk: MyUIMessageChunk): string | undefined {
  return getPartTypeFromChunk<MyUIMessage>(chunk, createToolPartTypeMap());
}

describe(`getPartTypeFromChunk`, () => {
  it(`should map text chunks to the text part`, () => {
    // Arrange
    const chunk = UIChunks.textDelta({ id: `1`, delta: `Hello` }) as MyUIMessageChunk;

    // Act
    const partType = partTypeOf(chunk);

    // Assert
    expect(partType).toBe(`text`);
  });

  it(`should map reasoning chunks to the reasoning part`, () => {
    // Arrange
    const chunk = UIChunks.reasoningDelta({ id: `1`, delta: `Think` }) as MyUIMessageChunk;

    // Act
    const partType = partTypeOf(chunk);

    // Assert
    expect(partType).toBe(`reasoning`);
  });

  it(`should map reasoning-file to its own part rather than the reasoning part`, () => {
    // Arrange
    const chunk = UIChunks.reasoningFile({
      url: `https://example.com/trace.png`,
      mediaType: `image/png`,
    }) as MyUIMessageChunk;

    // Act
    const partType = partTypeOf(chunk);

    // Assert
    expect(partType).toBe(`reasoning-file`);
  });

  it(`should map custom chunks to the custom part`, () => {
    // Arrange
    const chunk = UIChunks.custom({ kind: `openai.annotation` }) as MyUIMessageChunk;

    // Act
    const partType = partTypeOf(chunk);

    // Assert
    expect(partType).toBe(`custom`);
  });

  it(`should map a static tool call to its named tool part`, () => {
    // Arrange
    const toolPartTypes = createToolPartTypeMap();
    const start = UIChunks.toolInputStart({
      toolCallId: `1`,
      toolName: `weather`,
    }) as MyUIMessageChunk;
    const output = UIChunks.toolOutputAvailable({
      toolCallId: `1`,
      output: { temperature: 72 },
    }) as MyUIMessageChunk;

    // Act
    const startPartType = getPartTypeFromChunk<MyUIMessage>(start, toolPartTypes);
    const outputPartType = getPartTypeFromChunk<MyUIMessage>(output, toolPartTypes);

    // Assert
    expect(startPartType).toBe(`tool-weather`);
    expect(outputPartType).toBe(`tool-weather`);
  });

  it(`should map a dynamic tool call to the dynamic-tool part`, () => {
    // Arrange
    const toolPartTypes = createToolPartTypeMap();
    const start = UIChunks.toolInputStart({
      toolCallId: `1`,
      toolName: `calculator`,
      dynamic: true,
    }) as MyUIMessageChunk;

    // Act
    const partType = getPartTypeFromChunk<MyUIMessage>(start, toolPartTypes);

    // Assert
    expect(partType).toBe(`dynamic-tool`);
  });

  it(`should resolve a tool-approval-response through the approvalId of its request`, () => {
    // Arrange - the response chunk only references approvalId, never toolCallId
    const toolPartTypes = createToolPartTypeMap();
    const start = UIChunks.toolInputStart({
      toolCallId: `1`,
      toolName: `weather`,
    }) as MyUIMessageChunk;
    const request = UIChunks.toolApprovalRequest({
      toolCallId: `1`,
      approvalId: `approval-1`,
    }) as MyUIMessageChunk;
    const response = UIChunks.toolApprovalResponse({
      approvalId: `approval-1`,
      approved: true,
    }) as MyUIMessageChunk;

    // Act
    getPartTypeFromChunk<MyUIMessage>(start, toolPartTypes);
    const requestPartType = getPartTypeFromChunk<MyUIMessage>(request, toolPartTypes);
    const responsePartType = getPartTypeFromChunk<MyUIMessage>(response, toolPartTypes);

    // Assert
    expect(requestPartType).toBe(`tool-weather`);
    expect(responsePartType).toBe(`tool-weather`);
  });

  it(`should return undefined for a tool-approval-response with an unknown approvalId`, () => {
    // Arrange
    const chunk = UIChunks.toolApprovalResponse({
      approvalId: `never-seen`,
      approved: false,
    }) as MyUIMessageChunk;

    // Act
    const partType = partTypeOf(chunk);

    // Assert
    expect(partType).toBeUndefined();
  });

  it(`should return undefined for meta chunks`, () => {
    // Arrange
    const chunks = [
      UIChunks.start(),
      UIChunks.finish(),
      UIChunks.startStep(),
      UIChunks.finishStep(),
      UIChunks.abort(),
      UIChunks.error(`boom`),
    ] as Array<MyUIMessageChunk>;

    // Act
    const partTypes = chunks.map(partTypeOf);

    // Assert
    expect(partTypes).toEqual([undefined, undefined, undefined, undefined, undefined, undefined]);
  });

  it(`should map data chunks to their data part type`, () => {
    // Arrange
    const chunk = UIChunks.data(`weather`, {
      location: `Tokyo`,
      temperature: 72,
    }) as MyUIMessageChunk;

    // Act
    const partType = partTypeOf(chunk);

    // Assert
    expect(partType).toBe(`data-weather`);
  });

  it(`should throw for an unrecognized chunk type`, () => {
    // Arrange
    const chunk = { type: `not-a-chunk` } as unknown as MyUIMessageChunk;

    // Act
    const result = () => partTypeOf(chunk);

    // Assert
    expect(result).toThrow();
  });
});
