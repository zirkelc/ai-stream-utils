/**
 * Merge Deltas Example
 *
 * Demonstrates how to use pipe with map() to merge delta chunks over a time window.
 * Reduces the number of chunks before the stream reaches `readUIMessageStream()`.
 *
 * `readUIMessageStream()` clones the accumulated message for every chunk it processes.
 * Tool outputs are included in that clone. A sub-agent that receives a large tool output
 * and then streams many text tokens clones the large output once per token.
 *
 * Without merging, every token is one chunk and causes one clone:
 *   "Here" -> " is" -> " a" -> " summary" -> ...
 *
 * With merging, the deltas of one interval are one chunk and cause one clone:
 *   "Here is a summary of the page ..."
 */

import { isStepCount, readUIMessageStream, streamText, tool, type UIMessageChunk } from "ai";
import { Language, MockLanguageModel } from "ai-test-kit/language";
import { z } from "zod";
import { pipe } from "../src/index.js";

type DeltaChunk = Extract<
  UIMessageChunk,
  { type: `text-delta` | `reasoning-delta` | `tool-input-delta` }
>;

const isDeltaChunk = (chunk: UIMessageChunk): chunk is DeltaChunk =>
  chunk.type === `text-delta` ||
  chunk.type === `reasoning-delta` ||
  chunk.type === `tool-input-delta`;

/**
 * Deltas of the same part are merged into one chunk.
 * The key separates parts of different types that could share an id.
 */
const getDeltaKey = (chunk: DeltaChunk): string =>
  chunk.type === `tool-input-delta`
    ? `${chunk.type}:${chunk.toolCallId}`
    : `${chunk.type}:${chunk.id}`;

const appendDelta = (target: DeltaChunk, source: DeltaChunk): void => {
  if (target.type === `tool-input-delta` && source.type === `tool-input-delta`) {
    target.inputTextDelta += source.inputTextDelta;
  } else if (target.type !== `tool-input-delta` && source.type !== `tool-input-delta`) {
    target.delta += source.delta;
    /* The last delta wins when deltas carry provider metadata */
    if (source.providerMetadata) {
      target.providerMetadata = source.providerMetadata;
    }
  }
};

/**
 * Merges delta chunks in a UI message stream over a time window.
 *
 * Deltas are buffered until `intervalMs` has passed since the last flush.
 * Any other content chunk (for example `text-end` or `tool-output-available`)
 * flushes the buffer first, so the order of parts stays correct.
 *
 * The state lives inside this function, so each stream has its own buffer.
 *
 * Note: map() only runs when a chunk arrives. If the model pauses, the buffered
 * deltas wait for the next chunk. Every part ends with an end chunk, so no delta is lost.
 * Meta chunks (start, finish, abort, error) pass through map() without a flush.
 */
function mergeDeltasUIMessageStream({
  stream,
  intervalMs,
}: {
  stream: ReadableStream<UIMessageChunk>;
  intervalMs: number;
}) {
  /* A Map keeps the insertion order, so parts flush in the order they started */
  const buffer = new Map<string, DeltaChunk>();
  let lastFlush = Date.now();

  const flushBuffer = (): Array<UIMessageChunk> => {
    const chunks = [...buffer.values()];
    buffer.clear();
    lastFlush = Date.now();
    return chunks;
  };

  return pipe(stream)
    .map(({ chunk }) => {
      /* Other content chunks: flush buffer and pass through */
      if (!isDeltaChunk(chunk)) {
        return [...flushBuffer(), chunk];
      }

      const key = getDeltaKey(chunk);
      const buffered = buffer.get(key);
      if (buffered) {
        appendDelta(buffered, chunk);
      } else {
        /* Copy the chunk, because the buffered chunk is changed in place */
        buffer.set(key, { ...chunk });
      }

      if (Date.now() - lastFlush >= intervalMs) {
        return flushBuffer();
      }

      return null;
    })
    .toStream();
}

/**
 * A mock sub-agent: step 1 calls a scrape tool, step 2 streams a summary.
 * The tool output is about 500 KB, and the summary is 2,000 tokens.
 */
const createResult = () =>
  streamText({
    model: MockLanguageModel.from([
      {
        doStream: {
          chunks: [
            ...Language.streamToolInput({
              id: `call-1`,
              toolName: `scrape`,
              input: { url: `https://example.com` },
              length: 2,
            }),
            Language.toolCall({
              toolCallId: `call-1`,
              toolName: `scrape`,
              input: { url: `https://example.com` },
            }),
            Language.streamFinish({ finishReason: `tool-calls` }),
          ],
          chunkDelayInMs: 1,
        },
      },
      {
        doStream: {
          chunks: [
            ...Language.streamReasoning(`Let me summarize the page. `.repeat(50), {
              separator: ` `,
            }),
            ...Language.streamText(`Here is a summary of the page. `.repeat(300), {
              separator: ` `,
            }),
            Language.streamFinish(),
          ],
          chunkDelayInMs: 1,
        },
      },
    ]),
    prompt: `Scrape example.com and summarize it.`,
    tools: {
      scrape: tool({
        inputSchema: z.object({ url: z.string() }),
        execute: () => ({ html: `x`.repeat(500_000) }),
      }),
    },
    stopWhen: isStepCount(2),
  });

/**
 * Reads the stream into messages and measures the cost of the clones.
 * The JSON size of each snapshot is an approximation of the cloned bytes.
 */
const measure = async (stream: ReadableStream<UIMessageChunk>) => {
  let snapshots = 0;
  let clonedBytes = 0;
  let text = ``;

  for await (const message of readUIMessageStream({ stream })) {
    snapshots++;
    clonedBytes += JSON.stringify(message).length;
    text = message.parts
      .filter((part) => part.type === `text`)
      .map((part) => part.text)
      .join(``);
  }

  return { snapshots, clonedMB: Math.round(clonedBytes / 1_000_000), textLength: text.length };
};

const unmerged = await measure(createResult().toUIMessageStream());
const merged = await measure(
  mergeDeltasUIMessageStream({ stream: createResult().toUIMessageStream(), intervalMs: 100 }),
);

console.table({ unmerged, merged });

/*
 * Example output (the merged numbers depend on timing):
 *
 * ┌──────────┬───────────┬──────────┬────────────┐
 * │ (index)  │ snapshots │ clonedMB │ textLength │
 * ├──────────┼───────────┼──────────┼────────────┤
 * │ unmerged │ 2374      │ 1192     │ 9301       │
 * │ merged   │ 39        │ 18       │ 9301       │
 * └──────────┴───────────┴──────────┴────────────┘
 */
