/**
 * Finish Chunk vs Stream Close Example
 *
 * Demonstrates the timing difference between:
 * 1. When the `finish` chunk arrives (LLM done generating)
 * 2. When the stream actually closes (after server post-processing)
 *
 * Using `pipe().on(chunkType('finish'))` detects the finish chunk immediately,
 * while `for await...of` completion waits for the stream to close.
 */
import { readUIMessageStream, streamText } from "ai";
import { chunkType, convertAsyncIterableToStream, pipe } from "../src/index.js";
import { createMockModel, textToChunks } from "../src/test/mock-model.js";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function server() {
  const result = streamText({
    model: createMockModel({
      chunks: textToChunks({
        text: `Hello, this is a streaming response from the LLM!`,
        seperator: ` `,
      }),
      chunkDelayInMs: 50,
    }),
    prompt: `Say hello.`,
  });

  // Yield all chunks from the UI message stream
  return result.toUIMessageStream({
    onFinish: async () => {
      // Save chat to database, update analytics, ...
      await sleep(2_000);
    },
  });
}

async function client() {
  let isStreaming = true;
  let streamFinishedAt = 0;
  let streamClosedAt = 0;

  const stream = await server();

  const pipedStream = pipe(stream)
    .on(chunkType(`finish`), ({ chunk }) => {
      // Trigger UI update: message is complete, but stream is still open
      console.log(`Client: Finish chunk received: ${chunk.finishReason}`);
      streamFinishedAt = Date.now();
    })
    .toStream();

  for await (const _message of readUIMessageStream({ stream: pipedStream })) {
    // Update UI message state
  }
  streamClosedAt = Date.now();

  console.log(`Diff Finish - closed: ${streamClosedAt - streamFinishedAt}ms`);
  isStreaming = false;
}

client().catch(console.error);
