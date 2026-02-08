import { readUIMessageStream, type UIMessageChunk } from "ai";
import { describe, expect, it } from "vitest";
import {
  DATA_CHUNKS,
  DYNAMIC_TOOL_CHUNKS,
  FILE_CHUNKS,
  FINISH_CHUNK,
  type MyUIMessage,
  type MyUIMessageChunk,
  REASONING_CHUNKS,
  SOURCE_CHUNKS,
  START_CHUNK,
  TEXT_CHUNKS,
  TOOL_CLIENT_CHUNKS,
  TOOL_ERROR_CHUNKS,
  TOOL_SERVER_CHUNKS,
} from "../test/ui-message.js";
import { convertArrayToStream } from "../utils/convert-array-to-stream.js";
import { convertAsyncIterableToArray } from "../utils/convert-async-iterable-to-array.js";
import { fastReadUIMessageStream } from "./fast-read-ui-message-stream.js";

/**
 * Helper to collect all yielded messages by cloning them
 * (since fastReadUIMessageStream mutates in-place)
 */
async function collectMessages<T>(
  generator: AsyncGenerator<{ chunk: UIMessageChunk; message: T | undefined }>,
): Promise<Array<T>> {
  const results: Array<T> = [];
  for await (const { message } of generator) {
    if (message) {
      results.push(structuredClone(message));
    }
  }
  return results;
}

/**
 * Helper to collect all yielded results (chunk + message) by cloning them
 */
async function collectResults<T>(
  generator: AsyncGenerator<{ chunk: UIMessageChunk; message: T | undefined }>,
): Promise<Array<{ chunk: UIMessageChunk; message: T | undefined }>> {
  const results: Array<{ chunk: UIMessageChunk; message: T | undefined }> = [];
  for await (const item of generator) {
    results.push({
      chunk: item.chunk,
      message: item.message ? structuredClone(item.message) : undefined,
    });
  }
  return results;
}

describe(`fastReadUIMessageStream`, () => {
  describe(`basic text streaming`, () => {
    it(`should return messages for a basic input stream`, async () => {
      /* Arrange */
      const stream = convertArrayToStream([
        { type: `start`, messageId: `msg-123` },
        { type: `start-step` },
        { type: `text-start`, id: `text-1` },
        { type: `text-delta`, id: `text-1`, delta: `Hello, ` },
        { type: `text-delta`, id: `text-1`, delta: `world!` },
        { type: `text-end`, id: `text-1` },
        { type: `finish-step` },
        { type: `finish` },
      ] as Array<UIMessageChunk>);

      /* Act */
      const messages = await collectMessages(fastReadUIMessageStream(stream));

      /* Assert */
      expect(messages).toMatchInlineSnapshot(`
        [
          {
            "id": "msg-123",
            "metadata": undefined,
            "parts": [],
            "role": "assistant",
          },
          {
            "id": "msg-123",
            "metadata": undefined,
            "parts": [
              {
                "type": "step-start",
              },
              {
                "providerMetadata": undefined,
                "state": "streaming",
                "text": "",
                "type": "text",
              },
            ],
            "role": "assistant",
          },
          {
            "id": "msg-123",
            "metadata": undefined,
            "parts": [
              {
                "type": "step-start",
              },
              {
                "providerMetadata": undefined,
                "state": "streaming",
                "text": "Hello, ",
                "type": "text",
              },
            ],
            "role": "assistant",
          },
          {
            "id": "msg-123",
            "metadata": undefined,
            "parts": [
              {
                "type": "step-start",
              },
              {
                "providerMetadata": undefined,
                "state": "streaming",
                "text": "Hello, world!",
                "type": "text",
              },
            ],
            "role": "assistant",
          },
          {
            "id": "msg-123",
            "metadata": undefined,
            "parts": [
              {
                "type": "step-start",
              },
              {
                "providerMetadata": undefined,
                "state": "done",
                "text": "Hello, world!",
                "type": "text",
              },
            ],
            "role": "assistant",
          },
        ]
      `);
    });

    it(`should match AI SDK readUIMessageStream output for basic text`, async () => {
      /* Arrange */
      const chunks: Array<UIMessageChunk> = [
        { type: `start`, messageId: `msg-123` },
        { type: `start-step` },
        { type: `text-start`, id: `text-1` },
        { type: `text-delta`, id: `text-1`, delta: `Hello, ` },
        { type: `text-delta`, id: `text-1`, delta: `world!` },
        { type: `text-end`, id: `text-1` },
        { type: `finish-step` },
        { type: `finish` },
      ];

      const stream1 = convertArrayToStream(chunks);
      const stream2 = convertArrayToStream(chunks);

      /* Act */
      const fastMessages = await collectMessages(fastReadUIMessageStream(stream1));
      const sdkMessages = await convertAsyncIterableToArray(
        readUIMessageStream({ stream: stream2 }),
      );

      /* Assert - compare structure (fast version should match SDK) */
      expect(fastMessages.length).toBe(sdkMessages.length);

      for (let i = 0; i < fastMessages.length; i++) {
        expect(fastMessages[i]?.id).toBe(sdkMessages[i]?.id);
        expect(fastMessages[i]?.role).toBe(sdkMessages[i]?.role);
        expect(fastMessages[i]?.parts.length).toBe(sdkMessages[i]?.parts.length);

        /* Compare each part */
        for (let j = 0; j < (fastMessages[i]?.parts.length ?? 0); j++) {
          const fastPart = fastMessages[i]?.parts[j];
          const sdkPart = sdkMessages[i]?.parts[j];
          expect(fastPart?.type).toBe(sdkPart?.type);
          if (fastPart?.type === `text`) {
            expect((fastPart as { text: string }).text).toBe((sdkPart as { text: string }).text);
            expect((fastPart as { state: string }).state).toBe(
              (sdkPart as { state: string }).state,
            );
          }
        }
      }
    });
  });

  describe(`reasoning streaming`, () => {
    it(`should handle reasoning chunks`, async () => {
      /* Arrange */
      const stream = convertArrayToStream([START_CHUNK, ...REASONING_CHUNKS, FINISH_CHUNK]);

      /* Act */
      const messages = await collectMessages(fastReadUIMessageStream<MyUIMessage>(stream));

      /* Assert */
      const lastMessage = messages[messages.length - 1];
      const reasoningPart = lastMessage?.parts.find((p) => p.type === `reasoning`);
      expect(reasoningPart).toBeDefined();
      expect((reasoningPart as { text: string }).text).toBe(`Thinking...`);
      expect((reasoningPart as { state: string }).state).toBe(`done`);
    });

    it(`should accumulate reasoning text across deltas`, async () => {
      /* Arrange */
      const stream = convertArrayToStream([START_CHUNK, ...REASONING_CHUNKS, FINISH_CHUNK]);

      /* Act */
      const reasoningTexts: Array<string> = [];
      for await (const { message } of fastReadUIMessageStream<MyUIMessage>(stream)) {
        if (message) {
          const reasoningPart = message.parts.find((p) => p.type === `reasoning`);
          if (reasoningPart) {
            reasoningTexts.push((reasoningPart as { text: string }).text);
          }
        }
      }

      /* Assert */
      expect(reasoningTexts).toEqual([``, `Think`, `Thinking...`, `Thinking...`]);
    });
  });

  describe(`tool streaming`, () => {
    it(`should handle server-side tool chunks with output`, async () => {
      /* Arrange */
      const stream = convertArrayToStream([START_CHUNK, ...TOOL_SERVER_CHUNKS, FINISH_CHUNK]);

      /* Act */
      const messages = await collectMessages(fastReadUIMessageStream<MyUIMessage>(stream));

      /* Assert */
      const lastMessage = messages[messages.length - 1];
      const toolPart = lastMessage?.parts.find((p) => p.type === `tool-weather`);
      expect(toolPart).toBeDefined();
      expect((toolPart as { state: string }).state).toBe(`output-available`);
      expect((toolPart as { input: unknown }).input).toEqual({
        location: `Tokyo`,
      });
      expect((toolPart as { output: unknown }).output).toEqual({
        temperature: 72,
      });
    });

    it(`should handle client-side tool chunks without output`, async () => {
      /* Arrange */
      const stream = convertArrayToStream([START_CHUNK, ...TOOL_CLIENT_CHUNKS, FINISH_CHUNK]);

      /* Act */
      const messages = await collectMessages(fastReadUIMessageStream<MyUIMessage>(stream));

      /* Assert */
      const lastMessage = messages[messages.length - 1];
      const toolPart = lastMessage?.parts.find((p) => p.type === `tool-weather`);
      expect(toolPart).toBeDefined();
      expect((toolPart as { state: string }).state).toBe(`input-available`);
      expect((toolPart as { input: unknown }).input).toEqual({
        location: `Tokyo`,
      });
    });

    it(`should handle dynamic tool chunks`, async () => {
      /* Arrange */
      const stream = convertArrayToStream([START_CHUNK, ...DYNAMIC_TOOL_CHUNKS, FINISH_CHUNK]);

      /* Act */
      const messages = await collectMessages(fastReadUIMessageStream<MyUIMessage>(stream));

      /* Assert */
      const lastMessage = messages[messages.length - 1];
      const toolPart = lastMessage?.parts.find((p) => p.type === `dynamic-tool`);
      expect(toolPart).toBeDefined();
      expect((toolPart as { state: string }).state).toBe(`output-available`);
      expect((toolPart as { toolName: string }).toolName).toBe(`calculator`);
    });

    it(`should NOT parse partial JSON during tool-input-delta (performance optimization)`, async () => {
      /* Arrange */
      const stream = convertArrayToStream([START_CHUNK, ...TOOL_SERVER_CHUNKS, FINISH_CHUNK]);

      /* Act */
      const inputsDuringStreaming: Array<unknown> = [];
      for await (const { message } of fastReadUIMessageStream<MyUIMessage>(stream)) {
        if (message) {
          const toolPart = message.parts.find((p) => p.type === `tool-weather`);
          if (toolPart && (toolPart as { state: string }).state === `input-streaming`) {
            inputsDuringStreaming.push((toolPart as { input: unknown }).input);
          }
        }
      }

      /* Assert - input should be undefined during streaming (no partial parsing) */
      expect(inputsDuringStreaming.every((input) => input === undefined)).toBe(true);
    });
  });

  describe(`tool errors`, () => {
    it(`should handle tool error chunks`, async () => {
      /* Arrange */
      const stream = convertArrayToStream([START_CHUNK, ...TOOL_ERROR_CHUNKS, FINISH_CHUNK]);

      /* Act */
      const messages = await collectMessages(fastReadUIMessageStream<MyUIMessage>(stream));

      /* Assert */
      const lastMessage = messages[messages.length - 1];
      const errorPart = lastMessage?.parts.find(
        (p) => (p as { errorText?: string }).errorText !== undefined,
      );
      expect(errorPart).toBeDefined();
      expect((errorPart as { state: string }).state).toBe(`output-error`);
      expect((errorPart as { errorText: string }).errorText).toBe(`Execution failed`);
    });
  });

  describe(`file chunks`, () => {
    it(`should handle file chunks`, async () => {
      /* Arrange */
      const stream = convertArrayToStream([START_CHUNK, ...FILE_CHUNKS, FINISH_CHUNK]);

      /* Act */
      const messages = await collectMessages(fastReadUIMessageStream<MyUIMessage>(stream));

      /* Assert */
      const lastMessage = messages[messages.length - 1];
      const filePart = lastMessage?.parts.find((p) => p.type === `file`);
      expect(filePart).toBeDefined();
      expect((filePart as { url: string }).url).toBe(`https://example.com/file.pdf`);
      expect((filePart as { mediaType: string }).mediaType).toBe(`application/pdf`);
    });
  });

  describe(`source chunks`, () => {
    it(`should handle source-url and source-document chunks`, async () => {
      /* Arrange */
      const stream = convertArrayToStream([START_CHUNK, ...SOURCE_CHUNKS, FINISH_CHUNK]);

      /* Act */
      const messages = await collectMessages(fastReadUIMessageStream<MyUIMessage>(stream));

      /* Assert */
      const lastMessage = messages[messages.length - 1];
      const sourceUrlPart = lastMessage?.parts.find((p) => p.type === `source-url`);
      const sourceDocPart = lastMessage?.parts.find((p) => p.type === `source-document`);

      expect(sourceUrlPart).toBeDefined();
      expect((sourceUrlPart as { url: string }).url).toBe(`https://example.com`);

      expect(sourceDocPart).toBeDefined();
      expect((sourceDocPart as { mediaType: string }).mediaType).toBe(`application/pdf`);
    });
  });

  describe(`data chunks`, () => {
    it(`should handle custom data-* chunks`, async () => {
      /* Arrange */
      const stream = convertArrayToStream([START_CHUNK, ...DATA_CHUNKS, FINISH_CHUNK]);

      /* Act */
      const messages = await collectMessages(fastReadUIMessageStream<MyUIMessage>(stream));

      /* Assert */
      const lastMessage = messages[messages.length - 1];
      const dataPart = lastMessage?.parts.find((p) => p.type === `data-weather`);
      expect(dataPart).toBeDefined();
      expect((dataPart as { data: unknown }).data).toEqual({
        location: `Tokyo`,
        temperature: 72,
      });
    });
  });

  describe(`meta and step chunks`, () => {
    it(`should not yield message for meta chunks without content`, async () => {
      /* Arrange */
      const stream = convertArrayToStream([
        { type: `start` } /* no messageId or metadata */,
        { type: `finish` } /* no metadata */,
        { type: `abort` },
        { type: `error`, errorText: `test` },
      ] as Array<UIMessageChunk>);

      /* Act */
      const messages = await collectMessages(fastReadUIMessageStream(stream));

      /* Assert - no messages should be yielded */
      expect(messages.length).toBe(0);
    });

    it(`should yield message for start chunk with messageId`, async () => {
      /* Arrange */
      const stream = convertArrayToStream([
        { type: `start`, messageId: `msg-1` },
        { type: `finish` },
      ] as Array<UIMessageChunk>);

      /* Act */
      const messages = await collectMessages(fastReadUIMessageStream(stream));

      /* Assert */
      expect(messages.length).toBe(1);
      expect(messages[0]?.id).toBe(`msg-1`);
    });

    it(`should not yield message for step chunks but should add step-start part`, async () => {
      /* Arrange */
      const stream = convertArrayToStream([
        { type: `start`, messageId: `msg-1` },
        { type: `start-step` },
        {
          type: `text-start`,
          id: `text-1`,
        } /* Need content to see the step-start part */,
        { type: `text-end`, id: `text-1` },
        { type: `finish-step` },
        { type: `finish` },
      ] as Array<UIMessageChunk>);

      /* Act */
      const messages = await collectMessages(fastReadUIMessageStream(stream));

      /* Assert - step-start doesn't yield, but text chunks do */
      /* We should have: start (1), text-start (1), text-end (1) = 3 messages */
      expect(messages.length).toBe(3);
      /* The step-start part should be in the message (added before text parts) */
      expect(messages[1]?.parts.some((p) => p.type === `step-start`)).toBe(true);
      /* step-start should be first part */
      expect(messages[1]?.parts[0]?.type).toBe(`step-start`);
    });
  });

  describe(`message metadata`, () => {
    it(`should merge message metadata from start chunk`, async () => {
      /* Arrange */
      const stream = convertArrayToStream([
        { type: `start`, messageId: `msg-1`, messageMetadata: { foo: `bar` } },
        { type: `finish` },
      ] as Array<UIMessageChunk>);

      /* Act */
      const messages = await collectMessages(fastReadUIMessageStream(stream));

      /* Assert */
      expect(messages[0]?.metadata).toEqual({ foo: `bar` });
    });

    it(`should merge message metadata from message-metadata chunk`, async () => {
      /* Arrange */
      const stream = convertArrayToStream([
        { type: `start`, messageId: `msg-1`, messageMetadata: { foo: `bar` } },
        { type: `message-metadata`, messageMetadata: { baz: `qux` } },
        { type: `finish` },
      ] as Array<UIMessageChunk>);

      /* Act */
      const messages = await collectMessages(fastReadUIMessageStream(stream));

      /* Assert */
      expect(messages[1]?.metadata).toEqual({ foo: `bar`, baz: `qux` });
    });

    it(`should merge message metadata from finish chunk`, async () => {
      /* Arrange */
      const stream = convertArrayToStream([
        { type: `start`, messageId: `msg-1` },
        { type: `finish`, messageMetadata: { final: true } },
      ] as Array<UIMessageChunk>);

      /* Act */
      const messages = await collectMessages(fastReadUIMessageStream(stream));

      /* Assert */
      expect(messages.length).toBe(2);
      expect(messages[1]?.metadata).toEqual({ final: true });
    });
  });

  describe(`multi-step streaming`, () => {
    it(`should reset active parts between steps`, async () => {
      /* Arrange - two steps with text */
      const stream = convertArrayToStream([
        { type: `start`, messageId: `msg-1` },
        { type: `start-step` },
        { type: `text-start`, id: `text-1` },
        { type: `text-delta`, id: `text-1`, delta: `Step 1` },
        { type: `text-end`, id: `text-1` },
        { type: `finish-step` },
        { type: `start-step` },
        { type: `text-start`, id: `text-2` },
        { type: `text-delta`, id: `text-2`, delta: `Step 2` },
        { type: `text-end`, id: `text-2` },
        { type: `finish-step` },
        { type: `finish` },
      ] as Array<UIMessageChunk>);

      /* Act */
      const messages = await collectMessages(fastReadUIMessageStream(stream));

      /* Assert - final message should have both text parts */
      const lastMessage = messages[messages.length - 1];
      const textParts = lastMessage?.parts.filter((p) => p.type === `text`);
      expect(textParts?.length).toBe(2);
      expect((textParts?.[0] as { text: string }).text).toBe(`Step 1`);
      expect((textParts?.[1] as { text: string }).text).toBe(`Step 2`);
    });
  });

  describe(`chunk and message yielding`, () => {
    it(`should yield both chunk and message`, async () => {
      /* Arrange */
      const stream = convertArrayToStream([START_CHUNK, ...TEXT_CHUNKS, FINISH_CHUNK]);

      /* Act */
      const results: Array<{ chunkType: string; hasMessage: boolean }> = [];
      for await (const { chunk, message } of fastReadUIMessageStream<MyUIMessage>(stream)) {
        results.push({
          chunkType: chunk.type,
          hasMessage: message !== undefined,
        });
      }

      /* Assert */
      expect(results).toEqual([
        { chunkType: `start`, hasMessage: false },
        { chunkType: `start-step`, hasMessage: false },
        { chunkType: `text-start`, hasMessage: true },
        { chunkType: `text-delta`, hasMessage: true },
        { chunkType: `text-delta`, hasMessage: true },
        { chunkType: `text-end`, hasMessage: true },
        { chunkType: `finish-step`, hasMessage: false },
        { chunkType: `finish`, hasMessage: false },
      ]);
    });

    it(`should yield all chunks from the input stream`, async () => {
      /* Arrange */
      const stream = convertArrayToStream([START_CHUNK, ...TEXT_CHUNKS, FINISH_CHUNK]);

      /* Act */
      const chunks: Array<MyUIMessageChunk> = [];
      for await (const { chunk } of fastReadUIMessageStream<MyUIMessage>(stream)) {
        chunks.push(chunk as MyUIMessageChunk);
      }

      /* Assert */
      expect(chunks).toEqual([START_CHUNK, ...TEXT_CHUNKS, FINISH_CHUNK]);
    });

    it(`should accumulate text in parts across text-delta chunks`, async () => {
      /* Arrange */
      const stream = convertArrayToStream([START_CHUNK, ...TEXT_CHUNKS, FINISH_CHUNK]);

      /* Act */
      const textContents: Array<string> = [];
      for await (const { message } of fastReadUIMessageStream<MyUIMessage>(stream)) {
        if (message) {
          const textPart = message.parts.find((p) => p.type === `text`);
          if (textPart) {
            textContents.push((textPart as { text: string }).text);
          }
        }
      }

      /* Assert */
      expect(textContents).toEqual([``, `Hello`, `Hello World`, `Hello World`]);
    });

    it(`should release reader lock after iteration completes`, async () => {
      /* Arrange */
      const stream = convertArrayToStream([START_CHUNK, FINISH_CHUNK]);

      /* Act - consume all chunks */
      for await (const _ of fastReadUIMessageStream<MyUIMessage>(stream)) {
        /* Just iterate through */
      }

      /* Assert - should be able to get a new reader */
      const newReader = stream.getReader();
      const { done } = await newReader.read();
      expect(done).toBe(true);
      newReader.releaseLock();
    });
  });
});

describe(`comparison with AI SDK readUIMessageStream`, () => {
  it(`should produce same final message for text streaming`, async () => {
    /* Arrange */
    const chunks: Array<MyUIMessageChunk> = [START_CHUNK, ...TEXT_CHUNKS, FINISH_CHUNK];

    const stream1 = convertArrayToStream(chunks);
    const stream2 = convertArrayToStream(chunks);

    /* Act */
    const fastMessages = await collectMessages(fastReadUIMessageStream<MyUIMessage>(stream1));
    const sdkMessages = await convertAsyncIterableToArray(
      readUIMessageStream<MyUIMessage>({ stream: stream2 }),
    );

    /* Assert */
    const fastLast = fastMessages[fastMessages.length - 1];
    const sdkLast = sdkMessages[sdkMessages.length - 1];

    expect(fastLast?.parts.length).toBe(sdkLast?.parts.length);

    const fastText = fastLast?.parts.find((p) => p.type === `text`);
    const sdkText = sdkLast?.parts.find((p) => p.type === `text`);

    expect((fastText as { text: string }).text).toBe((sdkText as { text: string }).text);
  });

  it(`should produce same final message for tool streaming`, async () => {
    /* Arrange */
    const chunks: Array<MyUIMessageChunk> = [START_CHUNK, ...TOOL_SERVER_CHUNKS, FINISH_CHUNK];

    const stream1 = convertArrayToStream(chunks);
    const stream2 = convertArrayToStream(chunks);

    /* Act */
    const fastMessages = await collectMessages(fastReadUIMessageStream<MyUIMessage>(stream1));
    const sdkMessages = await convertAsyncIterableToArray(
      readUIMessageStream<MyUIMessage>({ stream: stream2 }),
    );

    /* Assert */
    const fastLast = fastMessages[fastMessages.length - 1];
    const sdkLast = sdkMessages[sdkMessages.length - 1];

    const fastTool = fastLast?.parts.find((p) => p.type === `tool-weather`);
    const sdkTool = sdkLast?.parts.find((p) => p.type === `tool-weather`);

    expect((fastTool as { state: string }).state).toBe((sdkTool as { state: string }).state);
    expect((fastTool as { input: unknown }).input).toEqual((sdkTool as { input: unknown }).input);
    expect((fastTool as { output: unknown }).output).toEqual(
      (sdkTool as { output: unknown }).output,
    );
  });

  it(`should produce same message count for complete stream`, async () => {
    /* Arrange */
    const chunks: Array<MyUIMessageChunk> = [
      START_CHUNK,
      ...TEXT_CHUNKS,
      ...REASONING_CHUNKS,
      FINISH_CHUNK,
    ];

    const stream1 = convertArrayToStream(chunks);
    const stream2 = convertArrayToStream(chunks);

    /* Act */
    const fastMessages = await collectMessages(fastReadUIMessageStream<MyUIMessage>(stream1));
    const sdkMessages = await convertAsyncIterableToArray(
      readUIMessageStream<MyUIMessage>({ stream: stream2 }),
    );

    /* Assert */
    expect(fastMessages.length).toBe(sdkMessages.length);
  });
});
