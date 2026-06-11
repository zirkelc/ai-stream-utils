import { Iterable, Stream } from "ai-test-kit/language";
import { UIChunks } from "ai-test-kit/ui";
import { describe, expect, it } from "vitest";
import {
  FINISH_CHUNK,
  FINISH_STEP_CHUNK,
  type MyUIMessage,
  type MyUIMessageChunk,
  START_CHUNK,
  START_STEP_CHUNK,
  TEXT_CHUNKS,
  TOOL_SERVER_CHUNKS,
} from "../test/ui-message.js";
import { transformProviderMetadata } from "./transform-provider-metadata.js";
import { pipe } from "./pipe.js";

const META = { app: { traceId: `t1` } };

describe(`transformProviderMetadata`, () => {
  it(`should add provider metadata to chunks that support it`, async () => {
    // Arrange
    const stream = Stream.from([START_CHUNK, ...TEXT_CHUNKS, FINISH_CHUNK]);

    // Act
    const result = await Iterable.toArray(
      pipe<MyUIMessage>(stream)
        .map(transformProviderMetadata(({ metadata }) => ({ ...metadata, ...META })))
        .toStream(),
    );

    // Assert - every text chunk gains the metadata, meta/step chunks pass through unchanged
    expect(result).toEqual([
      START_CHUNK,
      START_STEP_CHUNK,
      { type: `text-start`, id: `1`, providerMetadata: META },
      { type: `text-delta`, id: `1`, delta: `Hello`, providerMetadata: META },
      { type: `text-delta`, id: `1`, delta: ` World`, providerMetadata: META },
      { type: `text-end`, id: `1`, providerMetadata: META },
      FINISH_STEP_CHUNK,
      FINISH_CHUNK,
    ]);
  });

  it(`should merge with existing provider metadata`, async () => {
    // Arrange - tool-input-available already carries provider metadata
    const input: Array<MyUIMessageChunk> = [
      START_CHUNK,
      UIChunks.toolInputStart({ toolCallId: `1`, toolName: `weather` }),
      UIChunks.toolInputAvailable({
        toolCallId: `1`,
        toolName: `weather`,
        input: { location: `Tokyo` },
        providerMetadata: { openai: { itemId: `fc_1` } },
      }),
      FINISH_CHUNK,
    ];
    const stream = Stream.from(input);

    // Act
    const result = await Iterable.toArray(
      pipe<MyUIMessage>(stream)
        .map(transformProviderMetadata(({ metadata }) => ({ ...metadata, ...META })))
        .toStream(),
    );

    // Assert - existing metadata is preserved alongside the added keys
    expect(result).toEqual([
      START_CHUNK,
      { type: `tool-input-start`, toolCallId: `1`, toolName: `weather`, providerMetadata: META },
      {
        type: `tool-input-available`,
        toolCallId: `1`,
        toolName: `weather`,
        input: { location: `Tokyo` },
        providerMetadata: { openai: { itemId: `fc_1` }, ...META },
      },
      FINISH_CHUNK,
    ]);
  });

  it(`should not modify chunks that do not support provider metadata`, async () => {
    // Arrange - TOOL_SERVER_CHUNKS includes tool-input-delta and tool-output-available
    const stream = Stream.from([START_CHUNK, ...TOOL_SERVER_CHUNKS, FINISH_CHUNK]);

    // Act
    const result = await Iterable.toArray(
      pipe<MyUIMessage>(stream)
        .map(transformProviderMetadata(({ metadata }) => ({ ...metadata, ...META })))
        .toStream(),
    );

    // Assert - only tool-input-start and tool-input-available gain metadata
    expect(result).toEqual([
      START_CHUNK,
      START_STEP_CHUNK,
      { type: `tool-input-start`, toolCallId: `3`, toolName: `weather`, providerMetadata: META },
      { type: `tool-input-delta`, toolCallId: `3`, inputTextDelta: `{"location":"Tokyo"}` },
      {
        type: `tool-input-available`,
        toolCallId: `3`,
        toolName: `weather`,
        input: { location: `Tokyo` },
        providerMetadata: META,
      },
      { type: `tool-output-available`, toolCallId: `3`, output: { temperature: 72 } },
      FINISH_STEP_CHUNK,
      FINISH_CHUNK,
    ]);
  });

  it(`should leave chunks unchanged when the callback returns undefined`, async () => {
    // Arrange
    const input = [START_CHUNK, ...TEXT_CHUNKS, FINISH_CHUNK];
    const stream = Stream.from(input);

    // Act
    const result = await Iterable.toArray(
      pipe<MyUIMessage>(stream)
        .map(transformProviderMetadata(() => undefined))
        .toStream(),
    );

    // Assert - stream is passed through verbatim
    expect(result).toEqual(input);
  });

  it(`should remove the provider metadata field when the callback returns null`, async () => {
    // Arrange - tool-input-available carries provider metadata
    const input: Array<MyUIMessageChunk> = [
      START_CHUNK,
      UIChunks.toolInputStart({ toolCallId: `1`, toolName: `weather` }),
      UIChunks.toolInputAvailable({
        toolCallId: `1`,
        toolName: `weather`,
        input: { location: `Tokyo` },
        providerMetadata: { openai: { itemId: `fc_1` } },
      }),
      FINISH_CHUNK,
    ];
    const stream = Stream.from(input);

    // Act
    const result = await Iterable.toArray(
      pipe<MyUIMessage>(stream)
        .map(transformProviderMetadata(() => null))
        .toStream(),
    );

    // Assert - the field is absent (not an empty object), and the chunk remains
    expect(result).toEqual([
      START_CHUNK,
      { type: `tool-input-start`, toolCallId: `1`, toolName: `weather` },
      {
        type: `tool-input-available`,
        toolCallId: `1`,
        toolName: `weather`,
        input: { location: `Tokyo` },
      },
      FINISH_CHUNK,
    ]);
    const toolInput = result.find((c) => c.type === `tool-input-available`) as Record<
      string,
      unknown
    >;
    expect(`providerMetadata` in toolInput).toBe(false);
  });
});
