/**
 * Smooth Streaming Example
 *
 * Demonstrates how to use mapUIMessageStream to implement smooth streaming.
 * Buffers text-delta chunks and re-emits them based on word/line boundaries.
 *
 * This mirrors the AI SDK's smoothStream function behavior.
 */

import { openai } from '@ai-sdk/openai';
import type { UIMessageChunk } from 'ai';
import { streamText } from 'ai';
import { mapUIMessageStream } from '../src/index.js';

// Chunking patterns
const WORD_REGEX = /\S+\s+/m; // Matches word + trailing whitespace
const LINE_REGEX = /\n+/m; // Matches newline(s)

function smoothUIMessageStream(
  // Original UI message stream
  stream: ReadableStream<UIMessageChunk>,
  // Regex to split text into chunks
  regex: RegExp,
) {
  // Buffer state
  let buffer = '';
  let currentId = '';

  // Map returns a new UI message stream
  return mapUIMessageStream(stream, ({ chunk }) => {
    // Non-text-delta: flush buffer, pass through
    if (chunk.type !== 'text-delta') {
      if (buffer.length > 0) {
        const flushed: UIMessageChunk = {
          type: 'text-delta',
          id: currentId,
          delta: buffer,
        };
        buffer = '';
        return [flushed, chunk];
      }
      return chunk;
    }

    // Handle id change: flush old buffer first
    if (chunk.id !== currentId && buffer.length > 0) {
      const flushed: UIMessageChunk = {
        type: 'text-delta',
        id: currentId,
        delta: buffer,
      };
      buffer = chunk.delta;
      currentId = chunk.id;
      return [flushed];
    }

    // Buffer text deltas
    buffer += chunk.delta;
    currentId = chunk.id;

    const chunks: UIMessageChunk[] = [];
    let match: RegExpExecArray | null = null;

    // Split text matching the regex into new chunks
    // biome-ignore lint/suspicious/noAssignInExpressions: okay to assign in while loop
    while ((match = regex.exec(buffer)) !== null) {
      const text = buffer.slice(0, match.index) + match[0];
      chunks.push({ type: 'text-delta', id: currentId, delta: text });
      buffer = buffer.slice(text.length);
    }

    // Return new chunks
    return chunks;
  });
}

const result = streamText({
  model: openai('gpt-5'),
  prompt: 'Tell me a joke.',
});

const smoothedStream = smoothUIMessageStream(
  result.toUIMessageStream(), // Original stream
  WORD_REGEX, // Split text into chunks
);

for await (const chunk of smoothedStream) {
  console.log(chunk);
}
// Each text chunk is now a full word:
// { type: 'text-start'}
// { type: 'text-delta', delta: 'Why ' }
// { type: 'text-delta', delta: 'don’t ' }
// { type: 'text-delta', delta: 'scientists ' }
// { type: 'text-delta', delta: 'trust ' }
// { type: 'text-delta', delta: 'atoms? ' }
// { type: 'text-delta', delta: 'Because ' }
// { type: 'text-delta', delta: 'they ' }
// { type: 'text-delta', delta: 'make ' }
// { type: 'text-delta', delta: 'up ' }
// { type: 'text-delta', delta: 'everything.' }
// { type: 'text-end' }
