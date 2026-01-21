/**
 * Smooth Streaming Example
 *
 * Demonstrates how to use pipeUIMessageStream with smoothStreaming() operator.
 * Buffers text-delta chunks and re-emits them based on word or custom boundaries.
 *
 * This mirrors the AI SDK's smoothStream function behavior.
 */

import { streamText } from 'ai';
import { pipeUIMessageStream, smoothStreaming } from '../src/index.js';
import { createMockModel, textToChunks } from '../src/utils/test/mock-model.js';

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
 * Using pipeUIMessageStream with smoothStreaming() operator.
 * The smoothStreaming() operator buffers text and emits on word boundaries.
 */
const smoothedStream = pipeUIMessageStream(result.toUIMessageStream())
  .scan(smoothStreaming())
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
