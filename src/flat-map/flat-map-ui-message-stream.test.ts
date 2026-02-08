import { convertArrayToStream } from "../utils/convert-array-to-stream.js";
import { convertAsyncIterableToArray } from "../utils/convert-async-iterable-to-array.js";
import type { UIMessageChunk } from "ai";
import { describe, expect, it } from "vitest";
import {
  ABORT_CHUNK,
  ERROR_CHUNK,
  FILE_CHUNKS,
  FINISH_CHUNK,
  MESSAGE_METADATA_CHUNK,
  type MyUIMessage,
  type MyUIMessageChunk,
  REASONING_CHUNKS,
  START_CHUNK,
  TEXT_CHUNKS,
  TOOL_CLIENT_CHUNKS,
  TOOL_SERVER_CHUNKS,
  TOOL_WITH_DATA_CHUNKS,
} from "../test/ui-message.js";
import { flatMapUIMessageStream, partTypeIs } from "./flat-map-ui-message-stream.js";

describe("flatMapUIMessageStream", () => {
  it("should pass through all parts with identity flatMap", async () => {
    // Arrange
    const stream = convertArrayToStream([START_CHUNK, ...TEXT_CHUNKS, FINISH_CHUNK]);

    // Act
    const mappedStream = flatMapUIMessageStream(stream, ({ part }) => part);
    const result = await convertAsyncIterableToArray(mappedStream);

    // Assert - Parts are re-serialized with generated IDs
    expect(result.length).toBe(7);
    expect(result[0]).toEqual(START_CHUNK);
    expect(result[1]).toEqual({ type: "start-step" });
    expect(result[2]).toMatchObject({ type: "text-start", providerMetadata: undefined });
    expect(result[3]).toMatchObject({ type: "text-delta", delta: "Hello World" });
    expect(result[4]).toMatchObject({ type: "text-end", providerMetadata: undefined });
    expect(result[5]).toEqual({ type: "finish-step" });
    expect(result[6]).toEqual(FINISH_CHUNK);
    // Verify all text chunks have the same generated ID
    const textId = (result[2] as any).id;
    expect(textId).toMatch(/^aitxt-/);
    expect((result[3] as any).id).toBe(textId);
    expect((result[4] as any).id).toBe(textId);
  });

  it("should filter out parts by returning null", async () => {
    // Arrange
    const stream = convertArrayToStream([
      START_CHUNK,
      ...TEXT_CHUNKS,
      ...REASONING_CHUNKS,
      FINISH_CHUNK,
    ]);

    // Act
    const mappedStream = flatMapUIMessageStream(stream, ({ part }) => {
      return part.type === "reasoning" ? null : part;
    });
    const result = await convertAsyncIterableToArray(mappedStream);

    // Assert - Should not include reasoning chunks, text is re-serialized with generated ID
    expect(result.length).toBe(7);
    expect(result[0]).toEqual(START_CHUNK);
    expect(result[1]).toEqual({ type: "start-step" });
    expect(result[2]).toMatchObject({ type: "text-start", providerMetadata: undefined });
    expect(result[3]).toMatchObject({ type: "text-delta", delta: "Hello World" });
    expect(result[4]).toMatchObject({ type: "text-end", providerMetadata: undefined });
    expect(result[5]).toEqual({ type: "finish-step" });
    expect(result[6]).toEqual(FINISH_CHUNK);
    // Verify all text chunks have the same generated ID
    const textId = (result[2] as any).id;
    expect(textId).toMatch(/^aitxt-/);
    expect((result[3] as any).id).toBe(textId);
    expect((result[4] as any).id).toBe(textId);
  });

  it("should transform parts", async () => {
    const stream = convertArrayToStream([START_CHUNK, ...TEXT_CHUNKS, FINISH_CHUNK]);

    const mappedStream = flatMapUIMessageStream(stream, ({ part }) => {
      if (part.type === "text") {
        const textPart = part;
        return { ...textPart, text: textPart.text.toUpperCase() };
      }
      return part;
    });

    const result = await convertAsyncIterableToArray(mappedStream);

    // Find the text delta - it should be uppercase
    const textDeltas = result.filter((c) => c.type === "text-delta");
    expect(textDeltas.length).toBe(1);
    expect(textDeltas[0]!.delta).toBe("HELLO WORLD");
  });

  it("should handle single-chunk parts (file)", async () => {
    const stream = convertArrayToStream([START_CHUNK, ...FILE_CHUNKS, FINISH_CHUNK]);

    const mappedStream = flatMapUIMessageStream(stream, ({ part }) => {
      expect(part.type).toBe("file");
      return part;
    });

    const result = await convertAsyncIterableToArray(mappedStream);

    const fileChunks = result.filter((c) => c.type === "file");
    expect(fileChunks.length).toBe(1);
  });

  it("should handle server-side tool (with execute function)", async () => {
    const stream = convertArrayToStream([START_CHUNK, ...TOOL_SERVER_CHUNKS, FINISH_CHUNK]);

    let capturedPart: unknown;
    const mappedStream = flatMapUIMessageStream(stream, ({ part }) => {
      if (part.type === "tool-weather") {
        capturedPart = part;
      }
      return part;
    });

    const result = await convertAsyncIterableToArray(mappedStream);

    // Part should have all tool properties populated
    expect(capturedPart).toMatchObject({
      type: "tool-weather",
      toolCallId: "3",
      state: "output-available",
      input: { location: "Tokyo" },
      output: { temperature: 72 },
    });

    // Tool chunks should be present in output
    const toolChunks = result.filter((c) => c.type.startsWith("tool-"));
    expect(toolChunks.length).toBeGreaterThan(0);
  });

  it("should handle client-side tool (without execute function)", async () => {
    const stream = convertArrayToStream([START_CHUNK, ...TOOL_CLIENT_CHUNKS, FINISH_CHUNK]);

    let capturedPart: unknown;
    const mappedStream = flatMapUIMessageStream(stream, ({ part }) => {
      if (part.type === "tool-weather") {
        capturedPart = part;
      }
      return part;
    });

    const result = await convertAsyncIterableToArray(mappedStream);

    // Part should be captured with input-available state
    expect(capturedPart).toMatchObject({
      type: "tool-weather",
      toolCallId: "6",
      state: "input-available",
      input: { location: "Tokyo" },
    });

    // Tool chunks should be present in output
    const toolChunks = result.filter((c) => c.type.startsWith("tool-"));
    expect(toolChunks.length).toBeGreaterThan(0);
  });

  it("should handle data-* chunks interleaved with tool chunks", async () => {
    const stream = convertArrayToStream([START_CHUNK, ...TOOL_WITH_DATA_CHUNKS, FINISH_CHUNK]);

    let capturedToolPart: unknown;
    let capturedDataPart: unknown;
    const mappedStream = flatMapUIMessageStream<MyUIMessage>(stream, ({ part }) => {
      if (part.type === "tool-weather") {
        capturedToolPart = part;
      }
      if (part.type === "data-weather") {
        capturedDataPart = part;
      }
      return part;
    });

    const result = await convertAsyncIterableToArray(mappedStream);

    // Tool part should have complete info
    expect(capturedToolPart).toMatchObject({
      type: "tool-weather",
      toolCallId: "10",
      state: "output-available",
      input: { location: "Tokyo" },
      output: { location: "Tokyo", temperature: 72 },
    });

    // Data part should be captured
    expect(capturedDataPart).toMatchObject({
      type: "data-weather",
      data: { location: "Tokyo", temperature: 72 },
    });

    // Both tool and data chunks should be in output
    const toolChunks = result.filter((c) => c.type.startsWith("tool-"));
    const dataChunks = result.filter((c) => c.type === "data-weather");

    expect(toolChunks.length).toBeGreaterThan(0);
    expect(dataChunks.length).toBe(1);
  });

  it("should provide complete text part", async () => {
    const stream = convertArrayToStream([START_CHUNK, ...TEXT_CHUNKS, FINISH_CHUNK]);

    let capturedPart: unknown;
    const mappedStream = flatMapUIMessageStream(stream, ({ part }) => {
      if (part.type === "text") {
        capturedPart = part;
      }
      return part;
    });

    await convertAsyncIterableToArray(mappedStream);

    // Part should have accumulated text
    expect(capturedPart).toMatchObject({
      type: "text",
      text: "Hello World",
    });
  });

  it("should always pass through meta chunks", async () => {
    const stream = convertArrayToStream([
      START_CHUNK,
      MESSAGE_METADATA_CHUNK,
      ERROR_CHUNK,
      ABORT_CHUNK,
      FINISH_CHUNK,
    ]);

    // Even when returning null for everything, meta chunks pass through
    const mappedStream = flatMapUIMessageStream(stream, () => null);

    const result = await convertAsyncIterableToArray(mappedStream);

    expect(result).toEqual([
      START_CHUNK,
      MESSAGE_METADATA_CHUNK,
      ERROR_CHUNK,
      ABORT_CHUNK,
      FINISH_CHUNK,
    ]);
  });

  it("should not emit start-step if all content is filtered out", async () => {
    const stream = convertArrayToStream([START_CHUNK, ...REASONING_CHUNKS, FINISH_CHUNK]);

    const mappedStream = flatMapUIMessageStream(stream, () => null);

    const result = await convertAsyncIterableToArray(mappedStream);

    // Should not include start-step or finish-step
    expect(result).toEqual([START_CHUNK, FINISH_CHUNK]);
  });

  it("should provide index and parts array in context", async () => {
    const stream = convertArrayToStream([
      START_CHUNK,
      ...TEXT_CHUNKS,
      ...REASONING_CHUNKS,
      FINISH_CHUNK,
    ]);

    const indices: number[] = [];
    const partCounts: number[] = [];
    const mappedStream = flatMapUIMessageStream(stream, ({ part }, { index, parts }) => {
      indices.push(index);
      partCounts.push(parts.length);
      return part;
    });

    await convertAsyncIterableToArray(mappedStream);

    // Index should increment for each part
    expect(indices).toEqual([0, 1]);
    // Parts array should grow with each part
    expect(partCounts).toEqual([1, 2]);
  });

  it("should allow accessing previous parts", async () => {
    const stream = convertArrayToStream([
      START_CHUNK,
      ...TEXT_CHUNKS,
      ...REASONING_CHUNKS,
      FINISH_CHUNK,
    ]);

    let lastPartsSnapshot: MyUIMessage["parts"] = [];
    const mappedStream = flatMapUIMessageStream<MyUIMessage>(stream, ({ part }, { parts }) => {
      lastPartsSnapshot = [...parts];
      return part;
    });

    await convertAsyncIterableToArray(mappedStream);

    // Should have all parts at the end
    expect(lastPartsSnapshot.length).toBe(2);
    expect(lastPartsSnapshot[0]?.type).toBe("text");
    expect(lastPartsSnapshot[1]?.type).toBe("reasoning");
  });

  describe("predicate", () => {
    it("should buffer only matching parts and pass through others", async () => {
      const stream = convertArrayToStream([
        START_CHUNK,
        ...TEXT_CHUNKS,
        ...REASONING_CHUNKS,
        FINISH_CHUNK,
      ]);

      const processedTypes: string[] = [];
      const mappedStream = flatMapUIMessageStream(stream, partTypeIs("text"), ({ part }) => {
        processedTypes.push(part.type);
        return { ...part, text: part.text.toUpperCase() };
      });

      const result = await convertAsyncIterableToArray(mappedStream);

      // Only text should have been processed by flatMap
      expect(processedTypes).toEqual(["text"]);

      // Text should be transformed
      const textDeltas = result.filter((c) => c.type === "text-delta");
      expect(textDeltas.length).toBe(1);
      expect(textDeltas[0]!.delta).toBe("HELLO WORLD");

      // Reasoning should pass through unchanged
      const reasoningDeltas = result.filter((c) => c.type === "reasoning-delta");
      expect(reasoningDeltas.length).toBe(2);
      expect(reasoningDeltas[0]!.delta).toBe("Think");
      expect(reasoningDeltas[1]!.delta).toBe("ing...");
    });

    it("should support array of types", async () => {
      const stream = convertArrayToStream([
        START_CHUNK,
        ...TEXT_CHUNKS,
        ...REASONING_CHUNKS,
        ...FILE_CHUNKS,
        FINISH_CHUNK,
      ]);

      const processedTypes: string[] = [];
      const mappedStream = flatMapUIMessageStream(
        stream,
        partTypeIs(["text", "reasoning"]),
        ({ part }) => {
          processedTypes.push(part.type);
          return part;
        },
      );

      const result = await convertAsyncIterableToArray(mappedStream);

      // Both text and reasoning should be processed
      expect(processedTypes).toEqual(["text", "reasoning"]);

      // All parts should be present (file passed through)
      const fileChunks = result.filter((c) => c.type === "file");
      expect(fileChunks.length).toBe(1);
    });

    it("should filter matching parts when returning null", async () => {
      const stream = convertArrayToStream([
        START_CHUNK,
        ...TEXT_CHUNKS,
        ...REASONING_CHUNKS,
        FINISH_CHUNK,
      ]);

      const mappedStream = flatMapUIMessageStream(
        stream,
        partTypeIs("text"),
        ({ part }) => null, // Filter out text parts
      );

      const result = await convertAsyncIterableToArray(mappedStream);

      // Text should be filtered out
      const textChunks = result.filter((c) => c.type.startsWith("text"));
      expect(textChunks.length).toBe(0);

      // Reasoning should pass through (not matched by predicate)
      const reasoningChunks = result.filter((c) => c.type.startsWith("reasoning"));
      expect(reasoningChunks.length).toBe(4); // start, delta, delta, end
    });

    it("should pass through tool parts when predicate only matches text", async () => {
      const stream = convertArrayToStream([
        START_CHUNK,
        ...TOOL_SERVER_CHUNKS,
        ...TEXT_CHUNKS,
        FINISH_CHUNK,
      ]);

      const processedTypes: string[] = [];
      const mappedStream = flatMapUIMessageStream(stream, partTypeIs("text"), ({ part }) => {
        processedTypes.push(part.type);
        return part;
      });

      const result = await convertAsyncIterableToArray(mappedStream);

      // Only text should be processed
      expect(processedTypes).toEqual(["text"]);

      // Tool chunks should be present
      const toolChunks = result.filter((c) => c.type.startsWith("tool-"));
      expect(toolChunks.length).toBe(4);
    });

    it("should maintain step boundaries for passed-through parts", async () => {
      const stream = convertArrayToStream([START_CHUNK, ...REASONING_CHUNKS, FINISH_CHUNK]);

      const mappedStream = flatMapUIMessageStream(
        stream,
        partTypeIs("text"), // Only match text (reasoning will pass through)
        ({ part }) => part,
      );

      const result = await convertAsyncIterableToArray(mappedStream);

      // Step boundaries should be present for reasoning
      expect(result).toContainEqual({ type: "start-step" });
      expect(result).toContainEqual({ type: "finish-step" });
    });

    it("should stream non-matching chunks immediately without buffering", async () => {
      // This test verifies that chunks for non-matching parts are emitted
      // as they arrive, not buffered until the part is complete
      const chunks: MyUIMessageChunk[] = [START_CHUNK, ...REASONING_CHUNKS, FINISH_CHUNK];

      const stream = convertArrayToStream(chunks);
      const emittedChunks: UIMessageChunk[] = [];

      const mappedStream = flatMapUIMessageStream(
        stream,
        partTypeIs("text"), // Only buffer text, stream reasoning immediately
        ({ part }) => part,
      );

      // Collect chunks as they are emitted
      for await (const chunk of mappedStream) {
        emittedChunks.push(chunk);
      }

      // Verify all reasoning chunks are present and in order
      const reasoningChunks = emittedChunks.filter(
        (c) =>
          c.type === "reasoning-start" ||
          c.type === "reasoning-delta" ||
          c.type === "reasoning-end",
      );
      expect(reasoningChunks.length).toBe(4);
      expect(reasoningChunks[0]?.type).toBe("reasoning-start");
      expect(reasoningChunks[1]?.type).toBe("reasoning-delta");
      expect(reasoningChunks[2]?.type).toBe("reasoning-delta");
      expect(reasoningChunks[3]?.type).toBe("reasoning-end");
    });

    it("should buffer matching parts and stream non-matching parts in interleaved stream", async () => {
      // Interleaved stream: reasoning (stream) -> text (buffer) -> reasoning (stream)
      const chunks: MyUIMessageChunk[] = [
        START_CHUNK,
        { type: "start-step" },
        // First reasoning part (should stream immediately)
        { type: "reasoning-start", id: "1" },
        { type: "reasoning-delta", id: "1", delta: "First thought" },
        { type: "reasoning-end", id: "1" },
        // Text part (should be buffered and transformed)
        { type: "text-start", id: "2" },
        { type: "text-delta", id: "2", delta: "hello" },
        { type: "text-end", id: "2" },
        // Second reasoning part (should stream immediately)
        { type: "reasoning-start", id: "3" },
        { type: "reasoning-delta", id: "3", delta: "Second thought" },
        { type: "reasoning-end", id: "3" },
        { type: "finish-step" },
        FINISH_CHUNK,
      ];

      const stream = convertArrayToStream(chunks);

      const mappedStream = flatMapUIMessageStream(stream, partTypeIs("text"), ({ part }) => ({
        ...part,
        text: part.text.toUpperCase(),
      }));

      const result = await convertAsyncIterableToArray(mappedStream);

      // Reasoning should be unchanged (streamed through)
      const reasoningDeltas = result.filter((c) => c.type === "reasoning-delta");
      expect(reasoningDeltas.length).toBe(2);
      expect((reasoningDeltas[0] as { delta: string }).delta).toBe("First thought");
      expect((reasoningDeltas[1] as { delta: string }).delta).toBe("Second thought");

      // Text should be transformed (buffered)
      const textDeltas = result.filter((c) => c.type === "text-delta");
      expect(textDeltas.length).toBe(1);
      expect((textDeltas[0] as { delta: string }).delta).toBe("HELLO");

      // Step boundaries should be balanced (1 start-step, 1 finish-step)
      const startSteps = result.filter((c) => c.type === "start-step");
      const finishSteps = result.filter((c) => c.type === "finish-step");
      expect(startSteps.length).toBe(1);
      expect(finishSteps.length).toBe(1);
    });
  });

  describe("array", () => {
    it("should emit multiple parts when returning an array", async () => {
      const stream = convertArrayToStream([START_CHUNK, ...TEXT_CHUNKS, FINISH_CHUNK]);

      const mappedStream = flatMapUIMessageStream(stream, ({ part }) => {
        if (part.type === "text") {
          // Return multiple text parts
          return [
            { type: "text" as const, text: "[PREFIX] " },
            part,
            { type: "text" as const, text: " [SUFFIX]" },
          ];
        }
        return part;
      });

      const result = await convertAsyncIterableToArray(mappedStream);

      // Should have 3 text-delta chunks (one for each part)
      const textDeltas = result.filter((c) => c.type === "text-delta");
      expect(textDeltas).toHaveLength(3);
      expect(textDeltas[0]!.delta).toBe("[PREFIX] ");
      expect(textDeltas[1]!.delta).toBe("Hello World");
      expect(textDeltas[2]!.delta).toBe(" [SUFFIX]");
    });

    it("should filter out part when returning empty array", async () => {
      const stream = convertArrayToStream([
        START_CHUNK,
        ...TEXT_CHUNKS,
        ...REASONING_CHUNKS,
        FINISH_CHUNK,
      ]);

      const mappedStream = flatMapUIMessageStream(stream, ({ part }) => {
        // Return empty array for reasoning (same as returning null)
        return part.type === "reasoning" ? [] : part;
      });

      const result = await convertAsyncIterableToArray(mappedStream);

      // Should not include reasoning chunks
      const reasoningChunks = result.filter((c) => c.type.startsWith("reasoning"));
      expect(reasoningChunks).toHaveLength(0);

      // Text should still be present
      const textDeltas = result.filter((c) => c.type === "text-delta");
      expect(textDeltas).toHaveLength(1);
    });

    it("should handle single part in array same as returning part directly", async () => {
      const stream = convertArrayToStream([START_CHUNK, ...TEXT_CHUNKS, FINISH_CHUNK]);

      const mappedStream = flatMapUIMessageStream(stream, ({ part }) => {
        // Return part in array - should work same as returning part directly
        return [part];
      });

      const result = await convertAsyncIterableToArray(mappedStream);

      // Should produce same output as identity flatMap
      const textDeltas = result.filter((c) => c.type === "text-delta");
      expect(textDeltas).toHaveLength(1);
      expect(textDeltas[0]!.delta).toBe("Hello World");
    });

    it("should not emit step boundary when returning empty array for all content", async () => {
      const stream = convertArrayToStream([START_CHUNK, ...REASONING_CHUNKS, FINISH_CHUNK]);

      const mappedStream = flatMapUIMessageStream(stream, () => {
        // Filter all parts by returning empty array
        return [];
      });

      const result = await convertAsyncIterableToArray(mappedStream);

      // Should not include step boundaries since all content was filtered
      expect(result).toEqual([START_CHUNK, FINISH_CHUNK]);
    });

    it("should allow returning different part types", async () => {
      const stream = convertArrayToStream([START_CHUNK, ...TEXT_CHUNKS, FINISH_CHUNK]);

      const mappedStream = flatMapUIMessageStream(stream, ({ part }) => {
        if (part.type === "text") {
          // Transform text into reasoning + text
          return [
            {
              type: "reasoning" as const,
              text: "Thinking about: " + part.text,
            },
            part,
          ];
        }
        return part;
      });

      const result = await convertAsyncIterableToArray(mappedStream);

      // Should have both reasoning and text chunks
      const reasoningDeltas = result.filter((c) => c.type === "reasoning-delta");
      const textDeltas = result.filter((c) => c.type === "text-delta");

      expect(reasoningDeltas).toHaveLength(1);
      expect(reasoningDeltas[0]!.delta).toBe("Thinking about: Hello World");
      expect(textDeltas).toHaveLength(1);
      expect(textDeltas[0]!.delta).toBe("Hello World");
    });

    it("should handle array return with predicate", async () => {
      const stream = convertArrayToStream([
        START_CHUNK,
        ...TEXT_CHUNKS,
        ...REASONING_CHUNKS,
        FINISH_CHUNK,
      ]);

      const mappedStream = flatMapUIMessageStream(stream, partTypeIs("text"), ({ part }) => {
        // Return multiple parts for text
        return [
          { type: "text" as const, text: ">> " },
          { ...part, text: part.text.toUpperCase() },
        ];
      });

      const result = await convertAsyncIterableToArray(mappedStream);

      // Text should be transformed into multiple parts
      const textDeltas = result.filter((c) => c.type === "text-delta");
      expect(textDeltas).toHaveLength(2);
      expect(textDeltas[0]!.delta).toBe(">> ");
      expect(textDeltas[1]!.delta).toBe("HELLO WORLD");

      // Reasoning should pass through unchanged
      const reasoningDeltas = result.filter((c) => c.type === "reasoning-delta");
      expect(reasoningDeltas).toHaveLength(2);
    });
  });
});
