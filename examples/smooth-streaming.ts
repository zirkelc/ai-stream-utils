/**
 * Smooth Streaming Example
 *
 * Demonstrates how to use pipe with map() and closure state for buffering.
 * Buffers text-delta chunks and re-emits them based on word or custom boundaries.
 *
 * This mirrors the AI SDK's smoothStream function behavior.
 */

import { streamText } from "ai";
import { pipe } from "../src/index.js";
import { createMockModel, textToChunks } from "../src/test/mock-model.js";

const result = streamText({
  model: createMockModel({
    chunks: textToChunks({
      text: `Why don't scientists trust atoms? Because they make up everything.`,
      seperator: ` `,
    }),
  }),
  prompt: `Tell me a joke.`,
});

/**
 * Regex pattern for splitting text.
 * Default: /\S+\s+/m (word + trailing whitespace)
 */
const pattern = /\S+\s+/m;

/**
 * Closure state for smooth streaming.
 * These variables persist across map() calls.
 */
let buffer = ``;
let currentId = ``;

/**
 * Using pipe with map() and closure state for smooth streaming.
 * The map callback buffers text and emits on word boundaries.
 */
const smoothedStream = pipe(result.toUIMessageStream())
  .map(({ chunk }) => {
    /** Non-text-delta: flush buffer, pass through */
    if (chunk.type !== `text-delta`) {
      if (buffer.length > 0) {
        const flushed = {
          type: `text-delta` as const,
          id: currentId,
          delta: buffer,
        };
        buffer = ``;
        return [flushed, chunk];
      }
      return chunk;
    }

    /** Handle id change: flush old buffer first */
    const textDelta = chunk as {
      type: `text-delta`;
      id: string;
      delta: string;
    };
    if (textDelta.id !== currentId && buffer.length > 0) {
      const flushed = {
        type: `text-delta` as const,
        id: currentId,
        delta: buffer,
      };
      buffer = textDelta.delta;
      currentId = textDelta.id;
      return [flushed];
    }

    /** Buffer text deltas */
    buffer += textDelta.delta;
    currentId = textDelta.id;

    const chunks: Array<{ type: `text-delta`; id: string; delta: string }> = [];
    let match: RegExpExecArray | null = null;

    /** Split text matching the regex into new chunks */
    // biome-ignore lint/suspicious/noAssignInExpressions: okay to assign in while loop
    while ((match = pattern.exec(buffer)) !== null) {
      /** Only emit if match starts at beginning of buffer */
      if (match.index === 0) {
        chunks.push({ type: `text-delta`, id: currentId, delta: match[0] });
        buffer = buffer.slice(match[0].length);
      } else {
        /** There's content before the match - wait for more data */
        break;
      }
    }

    return chunks.length > 0 ? chunks : null;
  })
  .toStream();

for await (const chunk of smoothedStream) {
  console.log(chunk);
}
/** Each text chunk is now a full word:
 * { type: 'text-start'}
 * { type: 'text-delta', delta: 'Why ' }
 * { type: 'text-delta', delta: "don't " }
 * { type: 'text-delta', delta: 'scientists ' }
 * { type: 'text-delta', delta: 'trust ' }
 * { type: 'text-delta', delta: 'atoms? ' }
 * { type: 'text-delta', delta: 'Because ' }
 * { type: 'text-delta', delta: 'they ' }
 * { type: 'text-delta', delta: 'make ' }
 * { type: 'text-delta', delta: 'up ' }
 * { type: 'text-delta', delta: 'everything.' }
 * { type: 'text-end' }
 */
