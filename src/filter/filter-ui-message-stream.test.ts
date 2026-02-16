import { readUIMessageStream } from "ai";
import { describe, expect, it } from "vitest";
import { excludeParts, includeParts } from "../pipe/type-guards.js";
import {
  ABORT_CHUNK,
  DATA_CHUNKS,
  DYNAMIC_TOOL_CHUNKS,
  ERROR_CHUNK,
  FILE_CHUNKS,
  FINISH_CHUNK,
  MESSAGE_METADATA_CHUNK,
  type MyUIMessage,
  type MyUIMessagePart,
  REASONING_CHUNKS,
  SOURCE_CHUNKS,
  START_CHUNK,
  TEXT_CHUNKS,
  TOOL_SERVER_CHUNKS,
  TOOL_WITH_DATA_CHUNKS,
} from "../test/ui-message.js";
import { convertArrayToStream } from "../utils/convert-array-to-stream.js";
import { convertAsyncIterableToArray } from "../utils/convert-async-iterable-to-array.js";
import { filterUIMessageStream } from "./filter-ui-message-stream.js";

describe("filterUIMessageStream", () => {
  it("should filter chunks using include", async () => {
    const stream = convertArrayToStream([
      START_CHUNK,
      ...REASONING_CHUNKS,
      ...TEXT_CHUNKS,
      FINISH_CHUNK,
    ]);

    const filteredStream = filterUIMessageStream<MyUIMessage>(stream, includeParts(["text"]));

    const result = await convertAsyncIterableToArray(filteredStream);

    expect(result).toMatchInlineSnapshot(`
      [
        {
          "type": "start",
        },
        {
          "type": "start-step",
        },
        {
          "id": "1",
          "type": "text-start",
        },
        {
          "delta": "Hello",
          "id": "1",
          "type": "text-delta",
        },
        {
          "delta": " World",
          "id": "1",
          "type": "text-delta",
        },
        {
          "id": "1",
          "type": "text-end",
        },
        {
          "type": "finish-step",
        },
        {
          "type": "finish",
        },
      ]
    `);
  });

  it("should filter chunks using exclude", async () => {
    const stream = convertArrayToStream([
      START_CHUNK,
      ...REASONING_CHUNKS,
      ...TEXT_CHUNKS,
      FINISH_CHUNK,
    ]);

    const filteredStream = filterUIMessageStream(stream, excludeParts(["reasoning"]));

    const result = await convertAsyncIterableToArray(filteredStream);

    expect(result).toMatchInlineSnapshot(`
      [
        {
          "type": "start",
        },
        {
          "type": "start-step",
        },
        {
          "id": "1",
          "type": "text-start",
        },
        {
          "delta": "Hello",
          "id": "1",
          "type": "text-delta",
        },
        {
          "delta": " World",
          "id": "1",
          "type": "text-delta",
        },
        {
          "id": "1",
          "type": "text-end",
        },
        {
          "type": "finish-step",
        },
        {
          "type": "finish",
        },
      ]
    `);
  });

  it("should filter chunks using filter function", async () => {
    const stream = convertArrayToStream([
      START_CHUNK,
      ...TOOL_SERVER_CHUNKS,
      ...TEXT_CHUNKS,
      FINISH_CHUNK,
    ]);

    const filteredStream = filterUIMessageStream(stream, ({ part }: { part: { type: string } }) => {
      // Include any tool that starts with 'tool-weather'
      return part.type.startsWith(`tool-weather`);
    });

    const result = await convertAsyncIterableToArray(filteredStream);

    expect(result).toMatchInlineSnapshot(`
      [
        {
          "type": "start",
        },
        {
          "type": "start-step",
        },
        {
          "toolCallId": "3",
          "toolName": "weather",
          "type": "tool-input-start",
        },
        {
          "inputTextDelta": "{"location":"Tokyo"}",
          "toolCallId": "3",
          "type": "tool-input-delta",
        },
        {
          "input": {
            "location": "Tokyo",
          },
          "toolCallId": "3",
          "toolName": "weather",
          "type": "tool-input-available",
        },
        {
          "output": {
            "temperature": 72,
          },
          "toolCallId": "3",
          "type": "tool-output-available",
        },
        {
          "type": "finish-step",
        },
        {
          "type": "finish",
        },
      ]
    `);
  });

  it("should not include start-step if subsequent content is filtered out", async () => {
    const stream = convertArrayToStream([START_CHUNK, ...TEXT_CHUNKS, FINISH_CHUNK]);

    const filteredStream = filterUIMessageStream(stream, includeParts(["reasoning"]));

    const result = await convertAsyncIterableToArray(filteredStream);

    expect(result).toEqual([{ type: "start" }, { type: "finish" }]);
  });

  it("should always pass through controls chunks", async () => {
    const stream = convertArrayToStream([
      START_CHUNK,
      ABORT_CHUNK,
      MESSAGE_METADATA_CHUNK,
      ERROR_CHUNK,
      FINISH_CHUNK,
    ]);

    const filteredStream = filterUIMessageStream(stream, includeParts([]));

    const result = await convertAsyncIterableToArray(filteredStream);

    expect(result).toEqual([
      { type: "start" },
      { type: "abort" },
      { type: "message-metadata", messageMetadata: { id: "1" } },
      { type: "error", errorText: "Test error" },
      { type: "finish" },
    ]);
  });

  it("should handle data-* chunks interleaved with tool chunks", async () => {
    const stream = convertArrayToStream([START_CHUNK, ...TOOL_WITH_DATA_CHUNKS, FINISH_CHUNK]);

    // Filter to include only data-weather (not tool-weather)
    const filteredStream = filterUIMessageStream<MyUIMessage>(
      stream,
      includeParts(["data-weather"]),
    );

    const result = await convertAsyncIterableToArray(filteredStream);

    // Should include data-weather but not tool-weather chunks
    const dataChunks = result.filter((c) => c.type === "data-weather");
    const toolChunks = result.filter((c) => c.type.startsWith("tool-"));

    expect(dataChunks.length).toBe(1);
    expect(toolChunks.length).toBe(0);
  });

  it("should filter tool-weather without affecting data-weather", async () => {
    const stream = convertArrayToStream([START_CHUNK, ...TOOL_WITH_DATA_CHUNKS, FINISH_CHUNK]);

    // Exclude tool-weather, data-weather should still pass through
    const filteredStream = filterUIMessageStream<MyUIMessage>(
      stream,
      excludeParts(["tool-weather"]),
    );

    const result = await convertAsyncIterableToArray(filteredStream);

    // data-weather should be present
    const dataChunks = result.filter((c) => c.type === "data-weather");
    expect(dataChunks.length).toBe(1);

    // tool-weather chunks should be filtered out
    const toolChunks = result.filter((c) => c.type.startsWith("tool-"));
    expect(toolChunks.length).toBe(0);
  });

  describe("should handle each part type", () => {
    describe.each<MyUIMessagePart["type"]>([
      "text",
      "reasoning",
      "tool-weather",
      "dynamic-tool",
      "source-url",
      "source-document",
      "data-weather",
      "file",
    ])(" %s", async (partType) => {
      it("includeParts", async () => {
        const stream = convertArrayToStream([
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

        const filteredStream = filterUIMessageStream(stream, includeParts([partType]));

        const result = await convertAsyncIterableToArray(
          readUIMessageStream({ stream: filteredStream }),
        );

        const parts = result.flatMap((message) => message.parts);
        const partsByType = parts.filter((part) => part.type === partType);
        expect(partsByType.length).toBeGreaterThan(0);
      });

      it("excludeParts", async () => {
        const stream = convertArrayToStream([
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

        const filteredStream = filterUIMessageStream(stream, excludeParts([partType]));

        const result = await convertAsyncIterableToArray(
          readUIMessageStream({ stream: filteredStream }),
        );

        const parts = result.flatMap((message) => message.parts);
        const partsByType = parts.filter((part) => part.type === partType);
        expect(partsByType.length).toBe(0);
      });

      it("filter function", async () => {
        const stream = convertArrayToStream([
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

        const filteredStream = filterUIMessageStream(
          stream,
          ({ part }: { part: { type: string } }) => part.type === partType,
        );

        const result = await convertAsyncIterableToArray(
          readUIMessageStream({ stream: filteredStream }),
        );

        const parts = result.flatMap((message) => message.parts);
        const partsByType = parts.filter((part) => part.type === partType);
        expect(partsByType.length).toBeGreaterThan(0);
      });
    });
  });
});
