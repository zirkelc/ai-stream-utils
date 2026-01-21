/**
 * Test script to verify buffering behavior of pipeUIMessageStream.
 *
 * This test creates a slow input stream with deliberate delays between chunks,
 * then pipes it through pipeUIMessageStream and logs when chunks are produced
 * vs when they are received on the output.
 *
 * If pipeUIMessageStream buffers (waits for all input before emitting):
 *   - All INPUT logs will appear first, then all OUTPUT logs
 *
 * If pipeUIMessageStream passes through immediately:
 *   - INPUT and OUTPUT logs will be interleaved (output follows input closely)
 */

import type { UIMessageChunk } from 'ai';
import { pipeUIMessageStream } from '../src/pipe-ui-message-stream.js';

const DELAY_MS = 100;

// Create UI message chunks for testing
const chunks: UIMessageChunk[] = [
  { type: 'start', messageId: 'msg-1' },
  { type: 'start-step' },
  { type: 'text-start', id: 'text-1' },
  { type: 'text-delta', id: 'text-1', delta: 'Hello ' },
  { type: 'text-delta', id: 'text-1', delta: 'world!' },
  { type: 'text-end', id: 'text-1' },
  { type: 'finish-step' },
  {
    type: 'finish',
    finishReason: 'stop',
    usage: { inputTokens: 10, outputTokens: 5 },
  },
];

const startTime = Date.now();

function log(prefix: string, chunkType: string) {
  const elapsed = Date.now() - startTime;
  console.log(
    `${elapsed.toString().padStart(4)}ms | ${prefix.padEnd(6)} | ${chunkType}`,
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Creates a ReadableStream that emits chunks with delays,
 * logging when each chunk is produced.
 */
function createDelayedInputStream(): ReadableStream<UIMessageChunk> {
  let index = 0;

  return new ReadableStream<UIMessageChunk>({
    async pull(controller) {
      if (index >= chunks.length) {
        log('INPUT', '(stream closed)');
        controller.close();
        return;
      }

      // Delay before emitting (except first chunk)
      if (index > 0) {
        await delay(DELAY_MS);
      }

      const chunk = chunks[index]!;
      log('INPUT', chunk.type);
      controller.enqueue(chunk);
      index++;
    },
  });
}

async function main() {
  console.log('');
  console.log('='.repeat(50));
  console.log('Testing pipeUIMessageStream buffering behavior');
  console.log('='.repeat(50));
  console.log('');
  console.log(`Delay between input chunks: ${DELAY_MS}ms`);
  console.log('');
  console.log('Time | Source | Chunk Type');
  console.log('-'.repeat(50));

  const inputStream = createDelayedInputStream();

  // Pipe through with multiple chained map operations that transform and inspect
  const outputStream = pipeUIMessageStream(inputStream)
    .map(({ chunk, part }) => {
      // Map 1: Add prefix "A_" to text deltas
      if (chunk.type === 'text-delta') {
        const transformed = { ...chunk, delta: `A_${chunk.delta}` };
        console.log(
          `       | MAP1   | chunk.delta: "${chunk.delta}" -> "${transformed.delta}"`,
        );
        console.log(`       | MAP1   | part.text: "${(part as any).text}"`);
        return transformed;
      }
      return chunk;
    })
    .map(({ chunk, part }) => {
      // Map 2: Inspect previous transformation, add "B_" prefix
      if (chunk.type === 'text-delta') {
        const hasA = chunk.delta.startsWith('A_');
        console.log(
          `       | MAP2   | chunk.delta: "${chunk.delta}" (has A_: ${hasA})`,
        );
        console.log(`       | MAP2   | part.text: "${(part as any).text}"`);
        const transformed = { ...chunk, delta: `B_${chunk.delta}` };
        return transformed;
      }
      return chunk;
    })
    .map(({ chunk, part }) => {
      // Map 3: Inspect previous transformations, add "C_" prefix
      if (chunk.type === 'text-delta') {
        const hasBA = chunk.delta.startsWith('B_A_');
        console.log(
          `       | MAP3   | chunk.delta: "${chunk.delta}" (has B_A_: ${hasBA})`,
        );
        console.log(`       | MAP3   | part.text: "${(part as any).text}"`);
        const transformed = { ...chunk, delta: `C_${chunk.delta}` };
        return transformed;
      }
      return chunk;
    })
    .toStream();

  // Consume output and log when each chunk is received
  for await (const chunk of outputStream) {
    log('OUTPUT', chunk.type);
  }

  console.log('-'.repeat(50));
  console.log('');
  console.log('Analysis:');
  console.log('');
  console.log('If you see OUTPUT logs interleaved with INPUT logs,');
  console.log('then pipeUIMessageStream passes chunks through immediately.');
  console.log('');
  console.log('If you see all INPUT logs first, then all OUTPUT logs,');
  console.log('then pipeUIMessageStream buffers all chunks before emitting.');
  console.log('');
}

main().catch(console.error);
