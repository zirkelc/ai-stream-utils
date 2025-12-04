import { convertArrayToReadableStream } from '@ai-sdk/provider-utils/test';
import { describe, expect, it } from 'vitest';
import {
  ABORT_CHUNK,
  ERROR_CHUNK,
  FINISH_CHUNK,
  MESSAGE_METADATA_CHUNK,
  type MyUIMessage,
  REASONING_CHUNKS,
  START_CHUNK,
  TEXT_CHUNKS,
  TOOL_CHUNKS,
} from './test-utils.js';
import { createUIMessageStreamReader } from './ui-message-stream-reader.js';

describe('createUIMessageStreamReader', () => {
  it('should read chunks from the input stream', async () => {
    const stream = convertArrayToReadableStream([
      START_CHUNK,
      ...TEXT_CHUNKS,
      FINISH_CHUNK,
    ]);

    const reader = createUIMessageStreamReader<MyUIMessage>(stream);

    try {
      const chunks = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          reader.close();
          break;
        }
        chunks.push(value);
      }

      expect(chunks).toEqual([START_CHUNK, ...TEXT_CHUNKS, FINISH_CHUNK]);
    } finally {
      await reader.release();
    }
  });

  it('should return assembled message for content chunks', async () => {
    const stream = convertArrayToReadableStream([
      START_CHUNK,
      ...TEXT_CHUNKS,
      FINISH_CHUNK,
    ]);

    const reader = createUIMessageStreamReader<MyUIMessage>(stream);

    try {
      const messages = [];
      while (true) {
        const { done, value: chunk } = await reader.read();
        if (done) {
          reader.close();
          break;
        }

        const message = await reader.enqueue(chunk);
        if (message) {
          messages.push(message);
        }
      }

      // TEXT_CHUNKS has: start-step, text-start, text-delta, text-delta, text-end, finish-step
      // Content chunks are: text-start, text-delta, text-delta, text-end (4 messages)
      expect(messages.length).toBe(4);

      // Each message should have parts
      for (const message of messages) {
        expect(message.parts.length).toBeGreaterThan(0);
      }

      // Last message should have accumulated text
      const lastMessage = messages[messages.length - 1];
      const textPart = lastMessage?.parts.find((p) => p.type === 'text');
      expect(textPart).toBeDefined();
      expect((textPart as { text: string }).text).toBe('Hello World');
    } finally {
      await reader.release();
    }
  });

  it('should return undefined for meta chunks (start, finish, error, abort, message-metadata)', async () => {
    const stream = convertArrayToReadableStream([
      START_CHUNK,
      MESSAGE_METADATA_CHUNK,
      ERROR_CHUNK,
      ABORT_CHUNK,
      FINISH_CHUNK,
    ]);

    const reader = createUIMessageStreamReader<MyUIMessage>(stream);

    try {
      const results: Array<{
        chunk: typeof START_CHUNK;
        message: MyUIMessage | undefined;
      }> = [];
      while (true) {
        const { done, value: chunk } = await reader.read();
        if (done) {
          reader.close();
          break;
        }

        const message = await reader.enqueue(chunk);
        results.push({ chunk, message });
      }

      // All meta chunks should return undefined
      expect(results.every((r) => r.message === undefined)).toBe(true);
    } finally {
      await reader.release();
    }
  });

  it('should return undefined for step-start chunks', async () => {
    const stream = convertArrayToReadableStream([
      START_CHUNK,
      { type: 'start-step' as const },
      { type: 'text-start' as const, id: '1' },
      { type: 'text-end' as const, id: '1' },
      { type: 'finish-step' as const },
      FINISH_CHUNK,
    ]);

    const reader = createUIMessageStreamReader<MyUIMessage>(stream);

    try {
      const stepStartResults: Array<MyUIMessage | undefined> = [];
      while (true) {
        const { done, value: chunk } = await reader.read();
        if (done) {
          reader.close();
          break;
        }

        const message = await reader.enqueue(chunk);
        if (chunk.type === 'start-step') {
          stepStartResults.push(message);
        }
      }

      // step-start should return undefined
      expect(stepStartResults.length).toBe(1);
      expect(stepStartResults[0]).toBeUndefined();
    } finally {
      await reader.release();
    }
  });

  it('should return undefined for finish-step chunks', async () => {
    const stream = convertArrayToReadableStream([
      START_CHUNK,
      { type: 'start-step' as const },
      { type: 'text-start' as const, id: '1' },
      { type: 'text-end' as const, id: '1' },
      { type: 'finish-step' as const },
      FINISH_CHUNK,
    ]);

    const reader = createUIMessageStreamReader<MyUIMessage>(stream);

    try {
      const finishStepResults: Array<MyUIMessage | undefined> = [];
      while (true) {
        const { done, value: chunk } = await reader.read();
        if (done) {
          reader.close();
          break;
        }

        const message = await reader.enqueue(chunk);
        if (chunk.type === 'finish-step') {
          finishStepResults.push(message);
        }
      }

      // finish-step should return undefined
      expect(finishStepResults.length).toBe(1);
      expect(finishStepResults[0]).toBeUndefined();
    } finally {
      await reader.release();
    }
  });

  it('should accumulate text in parts across text-delta chunks', async () => {
    const stream = convertArrayToReadableStream([
      START_CHUNK,
      ...TEXT_CHUNKS,
      FINISH_CHUNK,
    ]);

    const reader = createUIMessageStreamReader<MyUIMessage>(stream);

    try {
      const textContents: string[] = [];
      while (true) {
        const { done, value: chunk } = await reader.read();
        if (done) {
          reader.close();
          break;
        }

        const message = await reader.enqueue(chunk);
        if (message) {
          const textPart = message.parts.find((p) => p.type === 'text');
          if (textPart) {
            textContents.push((textPart as { text: string }).text);
          }
        }
      }

      // AI SDK accumulates text: '', 'Hello', 'Hello World', 'Hello World'
      expect(textContents).toEqual(['', 'Hello', 'Hello World', 'Hello World']);
    } finally {
      await reader.release();
    }
  });

  it('should provide correct part type for tool chunks', async () => {
    const stream = convertArrayToReadableStream([
      START_CHUNK,
      ...TOOL_CHUNKS,
      FINISH_CHUNK,
    ]);

    const reader = createUIMessageStreamReader<MyUIMessage>(stream);

    try {
      const partTypes: string[] = [];
      while (true) {
        const { done, value: chunk } = await reader.read();
        if (done) {
          reader.close();
          break;
        }

        const message = await reader.enqueue(chunk);
        if (message) {
          const lastPart = message.parts[message.parts.length - 1];
          if (lastPart) {
            partTypes.push(lastPart.type);
          }
        }
      }

      // AI SDK uses 'tool-weather' as the part type (tool-{toolName})
      expect(partTypes.every((t) => t === 'tool-weather')).toBe(true);
    } finally {
      await reader.release();
    }
  });

  it('should handle reasoning chunks', async () => {
    const stream = convertArrayToReadableStream([
      START_CHUNK,
      ...REASONING_CHUNKS,
      FINISH_CHUNK,
    ]);

    const reader = createUIMessageStreamReader<MyUIMessage>(stream);

    try {
      const reasoningTexts: string[] = [];
      while (true) {
        const { done, value: chunk } = await reader.read();
        if (done) {
          reader.close();
          break;
        }

        const message = await reader.enqueue(chunk);
        if (message) {
          const reasoningPart = message.parts.find(
            (p) => p.type === 'reasoning',
          );
          if (reasoningPart) {
            reasoningTexts.push((reasoningPart as { text: string }).text);
          }
        }
      }

      // Reasoning text should accumulate
      expect(reasoningTexts).toEqual([
        '',
        'Think',
        'Thinking...',
        'Thinking...',
      ]);
    } finally {
      await reader.release();
    }
  });

  it('should close internal stream and allow iteration to complete', async () => {
    const stream = convertArrayToReadableStream([
      START_CHUNK,
      { type: 'start-step' as const },
      { type: 'text-start' as const, id: '1' },
      { type: 'text-end' as const, id: '1' },
      { type: 'finish-step' as const },
      FINISH_CHUNK,
    ]);

    const reader = createUIMessageStreamReader<MyUIMessage>(stream);

    // Read all chunks
    while (true) {
      const { done, value: chunk } = await reader.read();
      if (done) {
        reader.close();
        break;
      }
      await reader.enqueue(chunk);
    }

    // release() should complete without hanging
    await reader.release();

    // If we get here, the test passed
    expect(true).toBe(true);
  });

  it('should release reader lock after release() is called', async () => {
    const stream = convertArrayToReadableStream([START_CHUNK, FINISH_CHUNK]);

    const reader = createUIMessageStreamReader<MyUIMessage>(stream);

    while (true) {
      const { done, value: chunk } = await reader.read();
      if (done) {
        reader.close();
        break;
      }
      await reader.enqueue(chunk);
    }

    await reader.release();

    // After release, we should be able to get a new reader from the stream
    // (though it will be exhausted)
    const newReader = stream.getReader();
    const { done } = await newReader.read();
    expect(done).toBe(true);
    newReader.releaseLock();
  });

  it('should propagate errors via error() method', async () => {
    const stream = convertArrayToReadableStream([
      START_CHUNK,
      ...TEXT_CHUNKS,
      FINISH_CHUNK,
    ]);

    const reader = createUIMessageStreamReader<MyUIMessage>(stream);

    // Read first chunk (START_CHUNK is a meta chunk, returns undefined)
    const { value: firstChunk } = await reader.read();
    await reader.enqueue(firstChunk!);

    // Read second chunk (start-step, also returns undefined)
    const { value: secondChunk } = await reader.read();
    await reader.enqueue(secondChunk!);

    // Read third chunk (text-start, content chunk)
    const { value: thirdChunk } = await reader.read();
    await reader.enqueue(thirdChunk!);

    // Signal an error on the internal stream
    const testError = new Error('Test error');
    reader.error(testError);

    // After calling error(), the internal stream controller is closed
    // Attempting to enqueue more chunks will throw "Invalid state: Controller is already closed"
    const { value: fourthChunk } = await reader.read();

    // Enqueueing after error() throws because the controller is closed
    await expect(reader.enqueue(fourthChunk!)).rejects.toThrow('Invalid state');
  });

  it('should handle a complete stream lifecycle (read, enqueue, close, release)', async () => {
    const stream = convertArrayToReadableStream([
      START_CHUNK,
      ...TEXT_CHUNKS,
      ...REASONING_CHUNKS,
      FINISH_CHUNK,
    ]);

    const reader = createUIMessageStreamReader<MyUIMessage>(stream);

    const allChunks: (typeof START_CHUNK)[] = [];
    const allMessages: MyUIMessage[] = [];

    try {
      while (true) {
        const { done, value: chunk } = await reader.read();
        if (done) {
          reader.close();
          break;
        }

        allChunks.push(chunk);
        const message = await reader.enqueue(chunk);
        if (message) {
          allMessages.push(message);
        }
      }
    } finally {
      await reader.release();
    }

    // Should have read all chunks
    expect(allChunks).toEqual([
      START_CHUNK,
      ...TEXT_CHUNKS,
      ...REASONING_CHUNKS,
      FINISH_CHUNK,
    ]);

    // Should have received messages for content chunks only
    // TEXT_CHUNKS: start-step, text-start, text-delta, text-delta, text-end, finish-step (4 content)
    // REASONING_CHUNKS: start-step, reasoning-start, reasoning-delta, reasoning-delta, reasoning-end, finish-step (4 content)
    expect(allMessages.length).toBe(8);

    // Final message should have both text and reasoning parts
    const finalMessage = allMessages[allMessages.length - 1];
    expect(finalMessage?.parts.some((p) => p.type === 'text')).toBe(true);
    expect(finalMessage?.parts.some((p) => p.type === 'reasoning')).toBe(true);
  });
});
