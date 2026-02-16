import { convertArrayToReadableStream } from "@ai-sdk/provider-utils/test";
import { describe, expect, it } from "vitest";
import {
  DATA_CHUNKS,
  DYNAMIC_TOOL_CHUNKS,
  FILE_CHUNKS,
  FINISH_CHUNK,
  type MyUIMessage,
  REASONING_CHUNKS,
  SOURCE_CHUNKS,
  START_CHUNK,
  TEXT_CHUNKS,
  TOOL_SERVER_CHUNKS,
} from "../test/ui-message.js";
import { consumeUIMessageStream } from "./consume-ui-message-stream.js";

describe("consumeUIMessageStream", () => {
  it("should consume a stream with text chunks and return the final message", async () => {
    const stream = convertArrayToReadableStream([START_CHUNK, ...TEXT_CHUNKS, FINISH_CHUNK]);

    const message = await consumeUIMessageStream<MyUIMessage>(stream);

    expect(message.parts).toMatchInlineSnapshot(`
      [
        {
          "type": "step-start",
        },
        {
          "providerMetadata": undefined,
          "state": "done",
          "text": "Hello World",
          "type": "text",
        },
      ]
    `);

    const textPart = message.parts.find((part) => part.type === "text");
    expect(textPart).toBeDefined();
    expect(textPart?.type).toBe("text");
    expect((textPart as { text: string }).text).toBe("Hello World");
  });

  it("should consume a stream with all part types", async () => {
    const stream = convertArrayToReadableStream([
      START_CHUNK,
      ...TEXT_CHUNKS,
      ...REASONING_CHUNKS,
      ...TOOL_SERVER_CHUNKS,
      ...DYNAMIC_TOOL_CHUNKS,
      ...SOURCE_CHUNKS,
      ...FILE_CHUNKS,
      ...DATA_CHUNKS,
      FINISH_CHUNK,
    ]);

    const message = await consumeUIMessageStream<MyUIMessage>(stream);

    const partTypes = message.parts.map((part) => part.type);
    expect(partTypes).toMatchInlineSnapshot(`
      [
        "step-start",
        "text",
        "step-start",
        "reasoning",
        "step-start",
        "tool-weather",
        "step-start",
        "dynamic-tool",
        "step-start",
        "source-url",
        "source-document",
        "step-start",
        "file",
        "step-start",
        "data-weather",
      ]
    `);
  });

  it("should throw when stream produces no messages", async () => {
    const stream = convertArrayToReadableStream([START_CHUNK, FINISH_CHUNK]);

    await expect(consumeUIMessageStream<MyUIMessage>(stream)).rejects.toThrow(
      "Unexpected: stream ended without producing any messages",
    );
  });
});
