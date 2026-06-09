import { openai } from "@ai-sdk/openai";
import { type InferUITools, stepCountIs, streamText, tool, type UIMessage } from "ai";
import { z } from "zod";
import { pipe, transformProviderMetadata } from "../src/pipe";

/**
 * Example demonstrating `transformProviderMetadata()` to change `providerMetadata`
 * on the chunks that carry it (`text-*`, `reasoning-*`, `tool-input-*`, `source-*`, `file`).
 *
 * The callback receives the current `metadata` (may be `undefined`) and returns:
 * - an object to set/replace the metadata (merge by spreading `metadata`)
 * - `undefined` to leave the chunk unchanged
 * - `null` to remove the `providerMetadata` field entirely
 *
 * On the chunk stream the field is always `providerMetadata`. When the client
 * reconstructs the message, tool parts expose it as `callProviderMetadata` while
 * text and reasoning parts keep `providerMetadata`.
 */

export type MyTools = InferUITools<typeof tools>;
export type MyUIMessage = UIMessage<{}, {}, MyTools>;

const tools = {
  weather: tool({
    description: `Get the weather in a location`,
    inputSchema: z.object({
      location: z.string().describe(`The location to get weather for`),
    }),
    execute: ({ location }) => ({
      location,
      temperature: 72,
      conditions: `sunny`,
    }),
  }),
};

const result = streamText({
  model: openai(`gpt-5`),
  prompt: `What's the weather in Tokyo?`,
  tools,
  stopWhen: stepCountIs(5),
});

// Original metadata as sent by OpenAI (metadata-bearing chunks):
//   tool-input-start       —
//   tool-input-available   {"openai":{"itemId":"fc_…"}}
//   tool-output-available  —  (never a metadata-bearing chunk)
//   text-start             {"openai":{"itemId":"msg_…"}}
//   text-delta             —
//   text-end               {"openai":{"itemId":"msg_…"}}

/**
 * Example 1: Add (merge) metadata onto every metadata-bearing chunk.
 * Spreading `metadata` preserves whatever the provider already set.
 */
const streamMerge = pipe(result.toUIMessageStream<MyUIMessage>())
  .map(
    transformProviderMetadata(({ metadata }) => ({
      ...metadata,
      app: { traceId: `trace-123` },
    })),
  )
  .toStream();
// app.traceId is added to every metadata-bearing chunk, merged on top of openai:
//   tool-input-start       {"app":{"traceId":"trace-123"}}
//   tool-input-available   {"openai":{"itemId":"fc_…"},"app":{"traceId":"trace-123"}}
//   text-start             {"openai":{"itemId":"msg_…"},"app":{"traceId":"trace-123"}}
//   text-delta             {"app":{"traceId":"trace-123"}}
//   text-end               {"openai":{"itemId":"msg_…"},"app":{"traceId":"trace-123"}}

/**
 * Example 2: Replace metadata entirely.
 * Returning an object without spreading `metadata` discards the existing value.
 */
const streamReplace = pipe(result.toUIMessageStream<MyUIMessage>())
  .map(transformProviderMetadata(() => ({ app: { traceId: `trace-123` } })))
  .toStream();
// The provider's openai metadata is discarded; only app remains:
//   tool-input-available   {"app":{"traceId":"trace-123"}}
//   text-start             {"app":{"traceId":"trace-123"}}
//   text-end               {"app":{"traceId":"trace-123"}}

/**
 * Example 3: Remove all provider metadata before it reaches the client.
 * Returning `null` deletes the field (e.g. to strip provider-internal item ids).
 */
const streamStrip = pipe(result.toUIMessageStream<MyUIMessage>())
  .map(transformProviderMetadata(() => null))
  .toStream();
// Every providerMetadata field is removed:
//   tool-input-available   —
//   text-start             —
//   text-end               —

/**
 * Example 4: Target a specific chunk type.
 * Returning `undefined` for everything else leaves those chunks unchanged.
 */
const streamToolOnly = pipe(result.toUIMessageStream<MyUIMessage>())
  .map(
    transformProviderMetadata(({ chunk, metadata }) =>
      chunk.type === `tool-input-available`
        ? { ...metadata, app: { toolCallId: chunk.toolCallId } }
        : undefined,
    ),
  )
  .toStream();
// Only tool-input-available changes; text chunks are left untouched:
//   tool-input-available   {"openai":{"itemId":"fc_…"},"app":{"toolCallId":"call_…"}}
//   text-start             {"openai":{"itemId":"msg_…"}}
//   text-end               {"openai":{"itemId":"msg_…"}}

/**
 * Example 5: Target by part type.
 * The `part` lets you act on a part family (e.g. all text chunks) regardless of
 * which specific chunk type (text-start, text-delta, text-end) is passing through.
 */
const streamTextOnly = pipe(result.toUIMessageStream<MyUIMessage>())
  .map(
    transformProviderMetadata(({ part, metadata }) =>
      part.type === `text` ? { ...metadata, app: { redacted: true } } : undefined,
    ),
  )
  .toStream();
// All text chunks change; tool chunks are left untouched:
//   tool-input-available   {"openai":{"itemId":"fc_…"}}
//   text-start             {"openai":{"itemId":"msg_…"},"app":{"redacted":true}}
//   text-delta             {"app":{"redacted":true}}
//   text-end               {"openai":{"itemId":"msg_…"},"app":{"redacted":true}}

/**
 * Example 6: All three return modes in a single callback.
 * Add to tool input chunks, remove from text parts, leave everything else alone.
 */
const streamMixed = pipe(result.toUIMessageStream<MyUIMessage>())
  .map(
    transformProviderMetadata(({ chunk, part, metadata }) => {
      if (chunk.type === `tool-input-available`)
        return { ...metadata, app: { toolCallId: chunk.toolCallId } };

      if (part.type === `text`) return null;

      return undefined;
    }),
  )
  .toStream();
// Tool input gains app metadata, text loses it, everything else is unchanged:
//   tool-input-available   {"openai":{"itemId":"fc_…"},"app":{"toolCallId":"call_…"}}
//   text-start             —
//   text-end               —
