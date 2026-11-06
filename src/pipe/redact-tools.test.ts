import { Iterables, Streams } from "ai-test-kit";
import { describe, expect, it } from "vitest";
import {
  DYNAMIC_TOOL_CHUNKS,
  FINISH_CHUNK,
  FINISH_STEP_CHUNK,
  START_CHUNK,
  START_STEP_CHUNK,
  TEXT_CHUNKS,
  TOOL_ERROR_CHUNKS,
  TOOL_WITH_DATA_CHUNKS,
  type MyUIMessage,
  type MyUIMessageChunk,
} from "../test/ui-message.js";
import { pipe } from "./pipe.js";
import { redactTools } from "./redact-tools.js";
import type { ChunkMapFn } from "./types.js";

const run = (
  chunks: Array<MyUIMessageChunk>,
  fn: ChunkMapFn<MyUIMessage, MyUIMessageChunk, { type: string }>,
) => Iterables.toArray(pipe<MyUIMessage>(Streams.from(chunks)).map(fn).toStream());

const TOOL_START: MyUIMessageChunk = {
  type: `tool-input-start`,
  toolCallId: `10`,
  toolName: `weather`,
};
const DATA: MyUIMessageChunk = {
  type: `data-weather`,
  data: { location: `Tokyo`, temperature: 72 },
};
const INPUT: MyUIMessageChunk = {
  type: `tool-input-available`,
  toolCallId: `10`,
  toolName: `weather`,
  input: { location: `Tokyo` },
};
const OUTPUT: MyUIMessageChunk = {
  type: `tool-output-available`,
  toolCallId: `10`,
  output: { location: `Tokyo`, temperature: 72 },
};
const REDACTED_INPUT: MyUIMessageChunk = { ...INPUT, input: {} };
const REDACTED_OUTPUT: MyUIMessageChunk = { ...OUTPUT, output: null };

describe(`redactTools`, () => {
  it(`should redact the input and the output of all tools by default`, async () => {
    // Arrange
    const chunks = [
      START_CHUNK,
      ...TOOL_WITH_DATA_CHUNKS,
      ...DYNAMIC_TOOL_CHUNKS,
      ...TOOL_ERROR_CHUNKS,
      FINISH_CHUNK,
    ];

    // Act
    const result = await run(chunks, redactTools());

    // Assert - input deltas are dropped and error texts are kept
    expect(result).toEqual([
      START_CHUNK,
      START_STEP_CHUNK,
      TOOL_START,
      DATA,
      REDACTED_INPUT,
      REDACTED_OUTPUT,
      FINISH_STEP_CHUNK,
      START_STEP_CHUNK,
      { type: `tool-input-start`, toolCallId: `4`, toolName: `calculator`, dynamic: true },
      {
        type: `tool-input-available`,
        toolCallId: `4`,
        toolName: `calculator`,
        input: {},
        dynamic: true,
      },
      { type: `tool-output-available`, toolCallId: `4`, output: null, dynamic: true },
      FINISH_STEP_CHUNK,
      START_STEP_CHUNK,
      {
        type: `tool-input-error`,
        toolCallId: `5`,
        toolName: `failed`,
        input: {},
        errorText: `Invalid input`,
      },
      { type: `tool-output-error`, toolCallId: `5`, errorText: `Execution failed` },
      FINISH_STEP_CHUNK,
      FINISH_CHUNK,
    ]);
  });

  it(`should redact only the named tool`, async () => {
    // Arrange
    const chunks = [START_CHUNK, ...TOOL_WITH_DATA_CHUNKS, ...DYNAMIC_TOOL_CHUNKS, FINISH_CHUNK];

    // Act
    const result = await run(chunks, redactTools(`weather`));

    // Assert
    expect(result).toEqual([
      START_CHUNK,
      START_STEP_CHUNK,
      TOOL_START,
      DATA,
      REDACTED_INPUT,
      REDACTED_OUTPUT,
      FINISH_STEP_CHUNK,
      ...DYNAMIC_TOOL_CHUNKS,
      FINISH_CHUNK,
    ]);
  });

  it(`should redact an array of named tools`, async () => {
    // Arrange
    const chunks = [START_CHUNK, ...TOOL_WITH_DATA_CHUNKS, ...DYNAMIC_TOOL_CHUNKS, FINISH_CHUNK];

    // Act
    const result = await run(chunks, redactTools([`weather`]));

    // Assert
    expect(result).toEqual([
      START_CHUNK,
      START_STEP_CHUNK,
      TOOL_START,
      DATA,
      REDACTED_INPUT,
      REDACTED_OUTPUT,
      FINISH_STEP_CHUNK,
      ...DYNAMIC_TOOL_CHUNKS,
      FINISH_CHUNK,
    ]);
  });

  it(`should keep the output when output is false`, async () => {
    // Arrange
    const chunks = [START_CHUNK, ...TOOL_WITH_DATA_CHUNKS, FINISH_CHUNK];

    // Act
    const result = await run(chunks, redactTools({ output: false }));

    // Assert
    expect(result).toEqual([
      START_CHUNK,
      START_STEP_CHUNK,
      TOOL_START,
      DATA,
      REDACTED_INPUT,
      OUTPUT,
      FINISH_STEP_CHUNK,
      FINISH_CHUNK,
    ]);
  });

  it(`should keep the input when input is false`, async () => {
    // Arrange
    const chunks = [START_CHUNK, ...TOOL_WITH_DATA_CHUNKS, FINISH_CHUNK];

    // Act
    const result = await run(chunks, redactTools({ input: false }));

    // Assert - input deltas pass through too
    expect(result).toEqual([
      START_CHUNK,
      ...TOOL_WITH_DATA_CHUNKS.slice(0, -2),
      REDACTED_OUTPUT,
      FINISH_STEP_CHUNK,
      FINISH_CHUNK,
    ]);
  });

  it(`should combine a tool name with options`, async () => {
    // Arrange
    const chunks = [START_CHUNK, ...TOOL_WITH_DATA_CHUNKS, ...DYNAMIC_TOOL_CHUNKS, FINISH_CHUNK];

    // Act
    const result = await run(chunks, redactTools(`weather`, { output: false }));

    // Assert
    expect(result).toEqual([
      START_CHUNK,
      START_STEP_CHUNK,
      TOOL_START,
      DATA,
      REDACTED_INPUT,
      OUTPUT,
      FINISH_STEP_CHUNK,
      ...DYNAMIC_TOOL_CHUNKS,
      FINISH_CHUNK,
    ]);
  });

  it(`should replace the output with the result of an output function`, async () => {
    // Arrange
    const chunks = [START_CHUNK, ...TOOL_WITH_DATA_CHUNKS, FINISH_CHUNK];

    // Act
    const result = await run(
      chunks,
      redactTools({ output: (output) => ({ keys: Object.keys(output as object) }) }),
    );

    // Assert
    expect(result).toEqual([
      START_CHUNK,
      START_STEP_CHUNK,
      TOOL_START,
      DATA,
      REDACTED_INPUT,
      { ...OUTPUT, output: { keys: [`location`, `temperature`] } },
      FINISH_STEP_CHUNK,
      FINISH_CHUNK,
    ]);
  });

  it(`should replace the input with the result of an input function`, async () => {
    // Arrange
    const chunks = [START_CHUNK, ...TOOL_WITH_DATA_CHUNKS, ...TOOL_ERROR_CHUNKS, FINISH_CHUNK];

    // Act
    const result = await run(
      chunks,
      redactTools({ input: (input) => ({ redacted: Object.keys(input as object).length }) }),
    );

    // Assert - input deltas are still dropped
    expect(result).toEqual([
      START_CHUNK,
      START_STEP_CHUNK,
      TOOL_START,
      DATA,
      { ...INPUT, input: { redacted: 1 } },
      REDACTED_OUTPUT,
      FINISH_STEP_CHUNK,
      START_STEP_CHUNK,
      {
        type: `tool-input-error`,
        toolCallId: `5`,
        toolName: `failed`,
        input: { redacted: 0 },
        errorText: `Invalid input`,
      },
      { type: `tool-output-error`, toolCallId: `5`, errorText: `Execution failed` },
      FINISH_STEP_CHUNK,
      FINISH_CHUNK,
    ]);
  });

  it(`should leave all chunks unchanged when input and output are false`, async () => {
    // Arrange
    const chunks = [START_CHUNK, ...TOOL_WITH_DATA_CHUNKS, FINISH_CHUNK];

    // Act
    const result = await run(chunks, redactTools({ input: false, output: false }));

    // Assert
    expect(result).toEqual(chunks);
  });

  it(`should pass non-tool chunks through unchanged`, async () => {
    // Arrange
    const chunks = [START_CHUNK, ...TEXT_CHUNKS, FINISH_CHUNK];

    // Act
    const result = await run(chunks, redactTools());

    // Assert
    expect(result).toEqual(chunks);
  });
});
