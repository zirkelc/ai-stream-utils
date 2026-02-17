/**
 * Lifecycle Events Example
 *
 * Demonstrates how to use pipe() with on() to observe lifecycle events
 * like start, finish, and reasoning chunks without filtering them out.
 *
 * The on() method is useful for logging, analytics, or triggering side effects
 * while allowing all chunks to pass through the pipeline.
 */

import { openai } from "@ai-sdk/openai";
import { generateId, streamText } from "ai";
import { chunkType, consumeUIMessageStream, pipe } from "../src/index.js";

const result = streamText({
  model: openai("gpt-5"),
  prompt: `Explain LLMs in simple terms.`,
});

let thinkingStart: number = 0;

// Using pipe with on() to observe stream lifecycle events
const stream = pipe(result.toUIMessageStream({ generateMessageId: generateId }))
  // Stream started
  .on(chunkType(`start`), ({ chunk }) => {
    console.log(`Start of message ID: ${chunk.messageId}`);
  })
  // Stream finished
  .on(chunkType(`finish`), ({ chunk }) => {
    console.log(`Finished with reason: ${chunk.finishReason}`);
  })
  // Reasoning started
  .on(chunkType(`reasoning-start`), () => {
    thinkingStart = Date.now();
    console.log(`Thinking...`);
  })
  // Reasoning finsihed
  .on(chunkType(`reasoning-end`), () => {
    const thinkingDuration = Date.now() - thinkingStart;
    console.log(`Thought for ${thinkingDuration}ms`);
  })
  .toStream();

const message = await consumeUIMessageStream(stream);
console.log("Message:", message);

// Start of message ID: DC7g8OE6kvYZz0FO
// Thinking...
// Thought for 7875ms
// Finished with reason: stop
// Message:
// {
//   id: 'DC7g8OE6kvYZz0FO',
//   role: 'assistant',
//   parts: [
//     { type: 'step-start' },
//     { type: 'reasoning', text: '', state: 'done' },
//     { type: 'text', text: 'Think of a Large Language Model (LLM) as ...',  state: 'done' }
//   ]
// }
