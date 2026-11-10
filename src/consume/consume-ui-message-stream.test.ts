import type { InferUIMessageChunk } from "ai";
import { Streams } from "ai-test-kit";
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

type MyUIMessageChunk = InferUIMessageChunk<MyUIMessage>;

function streamFromGenerator(
  generator: () => AsyncGenerator<MyUIMessageChunk>,
): ReadableStream<MyUIMessageChunk> {
  return ReadableStream.from(generator());
}

describe("consumeUIMessageStream", () => {
  it("should consume a stream with text chunks and return the final message", async () => {
    const stream = Streams.from([START_CHUNK, ...TEXT_CHUNKS, FINISH_CHUNK]);

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
    const stream = Streams.from([
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
    const stream = Streams.from([START_CHUNK, FINISH_CHUNK]);

    await expect(consumeUIMessageStream<MyUIMessage>(stream)).rejects.toThrow(
      "Unexpected: stream ended without producing any messages",
    );
  });

  describe("source stream errors", () => {
    it("should reject with the source error when the stream throws after some chunks", async () => {
      // Arrange
      const error = new Error("boom");
      const stream = streamFromGenerator(async function* () {
        yield START_CHUNK;
        yield* TEXT_CHUNKS.slice(0, 3);
        throw error;
      });

      // Act
      const result = consumeUIMessageStream<MyUIMessage>(stream);

      // Assert
      await expect(result).rejects.toBe(error);
    });

    it("should reject with the source error when the stream throws before any chunk", async () => {
      // Arrange
      const error = new Error("boom");
      // oxlint-disable-next-line require-yield -- the stream must fail before the first chunk
      const stream = streamFromGenerator(async function* () {
        throw error;
      });

      // Act
      const result = consumeUIMessageStream<MyUIMessage>(stream);

      // Assert
      await expect(result).rejects.toBe(error);
    });

    it("should resolve when the stream contains an error chunk", async () => {
      // Arrange
      const stream = Streams.from<MyUIMessageChunk>([
        START_CHUNK,
        ...TEXT_CHUNKS,
        { type: "error", errorText: "chunk error" },
        FINISH_CHUNK,
      ]);

      // Act
      const message = await consumeUIMessageStream<MyUIMessage>(stream);

      // Assert
      const textPart = message.parts.find((part) => part.type === "text");
      expect((textPart as { text: string }).text).toBe("Hello World");
    });
  });
});
