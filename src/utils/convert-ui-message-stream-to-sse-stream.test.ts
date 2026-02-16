import type { UIMessageChunk } from "ai";
import { describe, expect, test } from "vitest";
import { convertArrayToStream } from "./convert-array-to-stream.js";
import { convertSSEToUIMessageStream } from "./convert-sse-stream-to-ui-message-stream.js";
import { convertStreamToArray } from "./convert-stream-to-array.js";
import { convertUIMessageToSSEStream } from "./convert-ui-message-stream-to-sse-stream.js";

describe(`convertUIMessageToSSEStream`, () => {
  test(`should convert UI message chunks to SSE-formatted strings`, async () => {
    // Arrange
    const chunks: Array<UIMessageChunk> = [
      { type: `text-start`, id: `1` },
      { type: `text-delta`, id: `1`, delta: `Hello` },
      { type: `text-end`, id: `1` },
    ];
    const uiStream = convertArrayToStream(chunks);

    // Act
    const sseStream = convertUIMessageToSSEStream(uiStream);
    const result = await convertStreamToArray(sseStream);

    // Assert
    expect(result.length).toBe(4);
    expect(result[0]).toBe(`data: {"type":"text-start","id":"1"}\n\n`);
    expect(result[1]).toBe(`data: {"type":"text-delta","id":"1","delta":"Hello"}\n\n`);
    expect(result[2]).toBe(`data: {"type":"text-end","id":"1"}\n\n`);
    expect(result[3]).toBe(`data: [DONE]\n\n`);
  });

  test(`should handle empty stream`, async () => {
    // Arrange
    const chunks: Array<UIMessageChunk> = [];
    const uiStream = convertArrayToStream(chunks);

    // Act
    const sseStream = convertUIMessageToSSEStream(uiStream);
    const result = await convertStreamToArray(sseStream);

    // Assert
    expect(result.length).toBe(1);
    expect(result[0]).toBe(`data: [DONE]\n\n`);
  });
});

describe(`round-trip conversion`, () => {
  test(`should preserve chunks through UI → SSE → UI conversion`, async () => {
    // Arrange
    const originalChunks: Array<UIMessageChunk> = [
      { type: `text-start`, id: `1` },
      { type: `text-delta`, id: `1`, delta: `Hello` },
      { type: `text-delta`, id: `1`, delta: ` world` },
      { type: `text-end`, id: `1` },
    ];
    const uiStream = convertArrayToStream(originalChunks);

    // Act
    const sseStream = convertUIMessageToSSEStream(uiStream);
    const restoredUiStream = convertSSEToUIMessageStream(sseStream);
    const result = await convertStreamToArray(restoredUiStream);

    // Assert
    expect(result.length).toBe(4);
    expect(result).toEqual(originalChunks);
  });

  test(`should handle various chunk types`, async () => {
    // Arrange
    const originalChunks: Array<UIMessageChunk> = [
      { type: `start-step` },
      { type: `text-start`, id: `1` },
      { type: `text-delta`, id: `1`, delta: `Thinking...` },
      { type: `text-end`, id: `1` },
      { type: `finish-step` },
      { type: `finish`, finishReason: `stop` },
    ];
    const uiStream = convertArrayToStream(originalChunks);

    // Act
    const sseStream = convertUIMessageToSSEStream(uiStream);
    const restoredUiStream = convertSSEToUIMessageStream(sseStream);
    const result = await convertStreamToArray(restoredUiStream);

    // Assert
    expect(result.length).toBe(6);
    expect(result).toEqual(originalChunks);
  });
});
