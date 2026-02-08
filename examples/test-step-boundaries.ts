/**
 * Test script to validate if step buffering in pipe.ts is necessary.
 *
 * This test uses readUIMessageStream from AI SDK directly (no pipe())
 * to understand how the SDK handles:
 * - Scenario A: Chunks without step boundaries (start-step/finish-step)
 * - Scenario B: Empty step boundaries (no content between start-step/finish-step)
 */

import { readUIMessageStream, type UIMessage, type UIMessageChunk } from "ai";
import { convertArrayToStream } from "../src/utils/convert-array-to-stream.js";

async function runScenario(name: string, chunks: Array<UIMessageChunk>) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Scenario: ${name}`);
  console.log(`${"=".repeat(60)}\n`);

  console.log(`Input chunks:`);
  chunks.forEach((c, i) => console.log(`  ${i}: ${c.type}`));
  console.log();

  try {
    const stream = convertArrayToStream(chunks);
    const messages = readUIMessageStream({ stream });

    console.log(`Output messages:`);
    let msgIndex = 0;
    let lastMessage: UIMessage | undefined;

    for await (const message of messages) {
      lastMessage = message;
      console.log(`  Message ${msgIndex++}:`);
      console.log(`    id: ${message.id}`);
      console.log(`    role: ${message.role}`);
      console.log(
        `    parts: ${JSON.stringify(message.parts, null, 2).split(`\n`).join(`\n    `)}`,
      );
    }

    console.log(`\nFinal message state:`);
    console.log(JSON.stringify(lastMessage, null, 2));
    console.log(`\nResult: SUCCESS`);
  } catch (error) {
    console.log(`\nResult: ERROR`);
    console.log(`Error:`, error);
  }
}

async function main() {
  /**
   * Scenario A: Chunks without step boundaries
   *
   * Question: Does readUIMessageStream still produce valid messages
   * when there are no start-step/finish-step chunks?
   */
  const chunksWithoutSteps: Array<UIMessageChunk> = [
    { type: `start`, messageId: `msg-1` },
    { type: `text-start`, id: `text-1` },
    { type: `text-delta`, id: `text-1`, delta: `Hello` },
    { type: `text-end`, id: `text-1` },
    { type: `finish`, finishReason: `stop`, usage: { inputTokens: 10, outputTokens: 5 } },
  ];

  await runScenario(`A: Chunks WITHOUT step boundaries`, chunksWithoutSteps);

  /**
   * Scenario B: Empty step boundaries
   *
   * Question: Does readUIMessageStream handle empty steps gracefully
   * (steps with no content between start-step and finish-step)?
   */
  const chunksWithEmptySteps: Array<UIMessageChunk> = [
    { type: `start`, messageId: `msg-1` },
    { type: `start-step` },
    { type: `finish-step` }, // No content between start/finish
    { type: `start-step` },
    { type: `text-start`, id: `text-1` },
    { type: `text-delta`, id: `text-1`, delta: `Hello` },
    { type: `text-end`, id: `text-1` },
    { type: `finish-step` },
    { type: `finish`, finishReason: `stop`, usage: { inputTokens: 10, outputTokens: 5 } },
  ];

  await runScenario(`B: Empty step boundaries`, chunksWithEmptySteps);

  /**
   * Scenario C: Normal case with step boundaries (baseline)
   *
   * This is the expected normal case for comparison.
   */
  const chunksWithSteps: Array<UIMessageChunk> = [
    { type: `start`, messageId: `msg-1` },
    { type: `start-step` },
    { type: `text-start`, id: `text-1` },
    { type: `text-delta`, id: `text-1`, delta: `Hello` },
    { type: `text-end`, id: `text-1` },
    { type: `finish-step` },
    { type: `finish`, finishReason: `stop`, usage: { inputTokens: 10, outputTokens: 5 } },
  ];

  await runScenario(`C: Normal case WITH step boundaries (baseline)`, chunksWithSteps);

  /**
   * Scenario D: Part ID reuse WITH finish-step
   *
   * This tests the main purpose of finish-step: resetting activeTextParts
   * so the same ID can be reused across steps.
   */
  const chunksWithIdReuse: Array<UIMessageChunk> = [
    { type: `start`, messageId: `msg-1` },
    // Step 1
    { type: `start-step` },
    { type: `text-start`, id: `text-1` },
    { type: `text-delta`, id: `text-1`, delta: `Hello from step 1` },
    { type: `text-end`, id: `text-1` },
    { type: `finish-step` }, // This resets activeTextParts, allowing ID reuse
    // Step 2 - reuses same ID "text-1"
    { type: `start-step` },
    { type: `text-start`, id: `text-1` }, // Same ID, different step
    { type: `text-delta`, id: `text-1`, delta: `Hello from step 2` },
    { type: `text-end`, id: `text-1` },
    { type: `finish-step` },
    { type: `finish`, finishReason: `stop`, usage: { inputTokens: 10, outputTokens: 5 } },
  ];

  await runScenario(`D: Part ID reuse WITH finish-step (should work)`, chunksWithIdReuse);

  /**
   * Scenario E: Part ID reuse WITHOUT finish-step
   *
   * This should fail because without finish-step, activeTextParts is not reset
   * and text-start for an already-tracked ID should cause issues.
   */
  const chunksWithIdReuseNoFinish: Array<UIMessageChunk> = [
    { type: `start`, messageId: `msg-1` },
    // Step 1
    { type: `start-step` },
    { type: `text-start`, id: `text-1` },
    { type: `text-delta`, id: `text-1`, delta: `Hello from step 1` },
    { type: `text-end`, id: `text-1` },
    // NO finish-step here!
    // Step 2 - reuses same ID "text-1"
    { type: `start-step` },
    { type: `text-start`, id: `text-1` }, // Same ID - what happens?
    { type: `text-delta`, id: `text-1`, delta: `Hello from step 2` },
    { type: `text-end`, id: `text-1` },
    { type: `finish`, finishReason: `stop`, usage: { inputTokens: 10, outputTokens: 5 } },
  ];

  await runScenario(`E: Part ID reuse WITHOUT finish-step`, chunksWithIdReuseNoFinish);

  /**
   * Scenario F: Part ID reuse while previous part is STILL STREAMING
   *
   * This tests what happens when:
   * 1. A text part starts streaming (no text-end yet)
   * 2. A new text-start with the SAME ID arrives
   *
   * Without finish-step, this creates duplicate parts.
   * With finish-step, the activeTextParts is reset, allowing clean reuse.
   */
  const chunksWithActiveIdReuse: Array<UIMessageChunk> = [
    { type: `start`, messageId: `msg-1` },
    { type: `start-step` },
    { type: `text-start`, id: `text-1` },
    { type: `text-delta`, id: `text-1`, delta: `Hello...` },
    // NO text-end! Part is still "active" in the state
    { type: `finish-step` }, // This resets activeTextParts
    { type: `start-step` },
    { type: `text-start`, id: `text-1` }, // Same ID - should work because finish-step reset the state
    { type: `text-delta`, id: `text-1`, delta: `World!` },
    { type: `text-end`, id: `text-1` },
    { type: `finish-step` },
    { type: `finish`, finishReason: `stop`, usage: { inputTokens: 10, outputTokens: 5 } },
  ];

  await runScenario(
    `F: Part ID reuse while previous is STREAMING (with finish-step)`,
    chunksWithActiveIdReuse,
  );

  /**
   * Scenario G: Part ID reuse while previous part is STILL STREAMING - NO finish-step
   *
   * Without finish-step, the second text-start should create a NEW part
   * (since the ID is still in activeTextParts pointing to the old part).
   */
  const chunksWithActiveIdReuseNoFinish: Array<UIMessageChunk> = [
    { type: `start`, messageId: `msg-1` },
    { type: `start-step` },
    { type: `text-start`, id: `text-1` },
    { type: `text-delta`, id: `text-1`, delta: `Hello...` },
    // NO text-end! Part is still "active" in the state
    // NO finish-step! activeTextParts still has text-1
    { type: `start-step` },
    { type: `text-start`, id: `text-1` }, // Same ID - what happens?
    { type: `text-delta`, id: `text-1`, delta: `World!` },
    { type: `text-end`, id: `text-1` },
    { type: `finish`, finishReason: `stop`, usage: { inputTokens: 10, outputTokens: 5 } },
  ];

  await runScenario(
    `G: Part ID reuse while previous is STREAMING (NO finish-step)`,
    chunksWithActiveIdReuseNoFinish,
  );

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Summary`);
  console.log(`${"=".repeat(60)}`);
  console.log(`
Scenario A: Step boundaries NOT required - content works without them.
Scenario B: Empty steps are handled gracefully (add orphaned step-start parts).
Scenario C: Baseline - normal flow with step boundaries.
Scenario D: Part ID reuse works WITH finish-step (resets activeTextParts).
Scenario E: Part ID reuse after text-end WITHOUT finish-step - works because
            text-end already removes the ID from activeTextParts.
Scenario F: Part ID reuse while STREAMING (with finish-step) - should work.
Scenario G: Part ID reuse while STREAMING (NO finish-step) - tests edge case.

Key insight from AI SDK source (process-ui-message-stream.ts):
- start-step: Adds { type: 'step-start' } part, no write()
- finish-step: Resets activeTextParts and activeReasoningParts, no write()
- text-end: Also deletes the ID from activeTextParts

The finish-step reset is important when parts are NOT properly ended with *-end chunks
before a new step begins (e.g., interrupted/aborted streaming).
`);
}

main().catch(console.error);
