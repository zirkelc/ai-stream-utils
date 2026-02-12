import { describe, expect, test } from "vitest";
import { convertArrayToStream } from "./convert-array-to-stream.js";
import { convertSSEToUIMessageStream } from "./convert-sse-stream-to-ui-message-stream.js";
import { convertStreamToArray } from "./convert-stream-to-array.js";

describe(`convertSSEToUIMessageStream`, () => {
  test(`should convert SSE-formatted strings to UI message chunks`, async () => {
    // Arrange
    const sseStrings = [
      `data: {"type":"text-start","id":"1"}\n\n`,
      `data: {"type":"text-delta","id":"1","delta":"Hello"}\n\n`,
      `data: {"type":"text-end","id":"1"}\n\n`,
    ];
    const sseStream = convertArrayToStream(sseStrings);

    // Act
    const uiStream = convertSSEToUIMessageStream(sseStream);
    const result = await convertStreamToArray(uiStream);

    // Assert
    expect(result.length).toBe(3);
    expect(result[0]).toEqual({ type: `text-start`, id: `1` });
    expect(result[1]).toEqual({ type: `text-delta`, id: `1`, delta: `Hello` });
    expect(result[2]).toEqual({ type: `text-end`, id: `1` });
  });

  test(`should handle empty stream`, async () => {
    // Arrange
    const sseStrings: Array<string> = [];
    const sseStream = convertArrayToStream(sseStrings);

    // Act
    const uiStream = convertSSEToUIMessageStream(sseStream);
    const result = await convertStreamToArray(uiStream);

    // Assert
    expect(result.length).toBe(0);
  });
});
