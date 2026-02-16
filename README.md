<div align='center'>

# ai-stream-utils

<p align="center">AI SDK: Stream transformation utilities for UI message streams</p>
<p align="center">
  <a href="https://www.npmjs.com/package/ai-stream-utils" alt="ai-stream-utils"><img src="https://img.shields.io/npm/dt/ai-stream-utils?label=ai-stream-utils"></a> <a href="https://github.com/zirkelc/ai-stream-utils/actions/workflows/ci.yml" alt="CI"><img src="https://img.shields.io/github/actions/workflow/status/zirkelc/ai-stream-utils/ci.yml?branch=main"></a>
</p>

</div>

This library provides composable stream transformation and filter utilities for UI message streams created by [`streamText()`](https://ai-sdk.dev/docs/reference/ai-sdk-core/stream-text) in the AI SDK.

### Why?

The AI SDK UI message stream created by [`toUIMessageStream()`](https://ai-sdk.dev/docs/reference/ai-sdk-core/stream-text#to-ui-message-stream) streams all parts (text, tools, reasoning, etc.) to the client by default. However, you may want to:

- **Filter**: Tool calls like database queries often contain large amounts of data or sensitive information that should not be visible on the client
- **Transform**: Modify text or tool outputs while they are streamed to the client

This library provides type-safe, composable utilities for all these use cases.

### Installation

This library only supports AI SDK v5.

```bash
npm install ai-stream-utils
```

## Overview

| Function                                            | Input                                                                                                           | Returns                    | Use Case                                                                      |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | -------------------------- | ----------------------------------------------------------------------------- |
| [`mapUIMessageStream`](#mapuimessagestream)         | [UIMessageChunk](https://github.com/vercel/ai/blob/main/packages/ai/src/ui-message-stream/ui-message-chunks.ts) | `chunk \| chunk[] \| null` | Transform or filter chunks in real-time (e.g., smooth streaming)              |
| [`flatMapUIMessageStream`](#flatmapuimessagestream) | [UIMessagePart](https://ai-sdk.dev/docs/reference/ai-sdk-core/ui-message#uimessagepart-types)                   | `part \| part[] \| null`   | Buffer until complete, then transform (e.g., redact tool output)              |
| [`filterUIMessageStream`](#filteruimessagestream)   | [UIMessageChunk](https://github.com/vercel/ai/blob/main/packages/ai/src/ui-message-stream/ui-message-chunks.ts) | `boolean`                  | Include/exclude parts by type (e.g., hide reasoning)                          |
| [`pipe`](#pipe-experimental)                        | [UIMessageChunk](https://github.com/vercel/ai/blob/main/packages/ai/src/ui-message-stream/ui-message-chunks.ts) | `ChunkPipeline`            | Composable pipeline API for chaining operations (experimental)                |
| [`consumeUIMessageStream`](#consumeuimessagestream) | [UIMessageChunk](https://github.com/vercel/ai/blob/main/packages/ai/src/ui-message-stream/ui-message-chunks.ts) | `Promise<UIMessage>`       | Consume entire stream and return final message (e.g., server-side processing) |

## Usage

### `mapUIMessageStream`

The `mapUIMessageStream` function operates on chunks and can be used to transform or filter individual chunks as they stream through. It receives the current chunk and the partial part representing all already processed chunks.

```typescript
import { mapUIMessageStream } from "ai-stream-utils";

const stream = mapUIMessageStream(result.toUIMessageStream<MyUIMessage>(), ({ chunk, part }) => {
  // Transform: modify the chunk
  if (chunk.type === "text-delta") {
    return { ...chunk, delta: chunk.delta.toUpperCase() };
  }
  // Filter: return null to exclude chunks
  if (part.type === "tool-weather") {
    return null;
  }
  return chunk;
});
```

### `flatMapUIMessageStream`

The `flatMapUIMessageStream` function operates on parts. It buffers all chunks of a particular type (e.g. text parts) until the part is complete and then transforms or filters the complete part. The optional predicate `partTypeIs()` can be used to selectively buffer only specific parts while streaming others through immediately.

```typescript
import { flatMapUIMessageStream, partTypeIs } from "ai-stream-utils";

const stream = flatMapUIMessageStream(
  result.toUIMessageStream<MyUIMessage>(),
  // Predicate to only buffer tool-weather parts and pass through other parts
  partTypeIs("tool-weather"),
  ({ part }) => {
    // Transform: modify the complete part
    if (part.state === "output-available") {
      return {
        ...part,
        output: { ...part.output, temperature: toFahrenheit(part.output.temperature) },
      };
    }
    // Filter: return null to exclude parts
    return part;
  },
);
```

### `filterUIMessageStream`

The `filterUIMessageStream` function is a convenience function around `mapUIMessageStream` with a simpler API to filter chunks by part type. It provides the `includeParts()` and `excludeParts()` predicates for common patterns.

```typescript
import { filterUIMessageStream, includeParts, excludeParts } from "ai-stream-utils";

// Include only specific parts
const stream = filterUIMessageStream(
  result.toUIMessageStream<MyUIMessage>(),
  includeParts(["text", "tool-weather"]),
);

// Exclude specific parts
const stream = filterUIMessageStream(
  result.toUIMessageStream<MyUIMessage>(),
  excludeParts(["reasoning", "tool-database"]),
);

// Custom filter function
const stream = filterUIMessageStream(result.toUIMessageStream<MyUIMessage>(), ({ part, chunk }) => {
  if (part.type === "text") return true;
  if (chunk.type === "tool-input-available") return true;
  return false;
});
```

### `pipe` (Experimental)

> [!WARN]
> This API is experimental and subject to change in future releases.

The `pipe` function provides a composable pipeline API for chaining filter, map, and observer operations on UI message streams.

```typescript
import {
  pipe,
  includeChunks,
  includeParts,
  excludeChunks,
  excludeParts,
  chunkType,
} from "ai-stream-utils";
```

**Basic usage:**

```typescript
const stream = pipe(result.toUIMessageStream<MyUIMessage>())
  .filter(includeParts(["text", "reasoning"]))
  .map(({ chunk }) => {
    if (chunk.type === "text-delta") {
      return { ...chunk, delta: chunk.delta.toUpperCase() };
    }
    return chunk;
  })
  .toStream();
```

**Methods:**

- `.filter(guard)` - Filter chunks using type guards (`includeChunks`, `includeParts`, `excludeChunks`, `excludeParts`)
- `.map(transformFn)` - Transform chunks (return chunk, array of chunks, or null to remove)
- `.on(guard, callback)` - Observe matching chunks without filtering (use with `isChunk`)
- `.toStream()` - Execute pipeline and return the resulting stream

**Type guards for `.filter()`:**

- `includeChunks('text-delta')` or `includeChunks(['text-delta', 'text-end'])` - Include specific chunk types
- `includeParts('text')` or `includeParts(['text', 'reasoning'])` - Include specific part types
- `excludeChunks('text-delta')` - Exclude specific chunk types
- `excludeParts('reasoning')` - Exclude specific part types

**Type guards for `.on()`:**

- `chunkType('text-delta')` or `chunkType(['text-delta', 'start'])` - Observe specific chunk types (including meta chunks)

**Type-safe filtering example:**

```typescript
const stream = pipe<MyUIMessage>(result.toUIMessageStream())
  .filter(includeParts("text"))
  .map(({ chunk, part }) => {
    // chunk is narrowed to text chunks only
    // part.type is narrowed to "text"
    return chunk;
  })
  .toStream();
```

**Observer example with `.on()`:**

```typescript
const stream = pipe(result.toUIMessageStream<MyUIMessage>())
  .on(chunkType("start"), ({ chunk }) => {
    console.log("Stream started");
  })
  .on(chunkType("text-delta"), ({ chunk }) => {
    console.log("Received text:", chunk.delta);
  })
  .on(chunkType("finish"), ({ chunk }) => {
    console.log("Stream finished");
  })
  .toStream();
```

### `consumeUIMessageStream`

The `consumeUIMessageStream` function consumes a UI message stream by fully reading it and returns the final assembled message. This is useful when you need to process the complete message on the server-side without streaming to the client.

```typescript
import { consumeUIMessageStream } from "ai-stream-utils";

const result = streamText({
  model: openai("gpt-4o"),
  prompt: "Tell me a joke",
});

/* Consume the entire stream and get the final message */
const message = await consumeUIMessageStream(result.toUIMessageStream<MyUIMessage>());

console.log(message.parts); // All parts fully assembled
```

## Examples

### Smooth Streaming

Buffers multiple text chunks into a string, splits at word boundaries and re-emits each word as a separate chunk for smoother UI rendering. See [examples/smooth-streaming.ts](./examples/smooth-streaming.ts) for the full implementation.

```typescript
import { mapUIMessageStream } from "ai-stream-utils";

const WORD_REGEX = /\S+\s+/m;
let buffer = "";

const smoothedStream = mapUIMessageStream(result.toUIMessageStream(), ({ chunk }) => {
  if (chunk.type !== "text-delta") {
    // Flush buffer on non-text chunks
    if (buffer.length > 0) {
      const flushed = { type: "text-delta" as const, id: chunk.id, delta: buffer };
      buffer = "";
      return [flushed, chunk];
    }
    return chunk;
  }

  // Append the text delta to the buffer
  buffer += chunk.delta;
  const chunks = [];

  let match;
  while ((match = WORD_REGEX.exec(buffer)) !== null) {
    chunks.push({
      type: "text-delta",
      id: chunk.id,
      delta: buffer.slice(0, match.index + match[0].length),
    });
    buffer = buffer.slice(match.index + match[0].length);
  }
  // Emit the word-by-word chunks
  return chunks;
});

// Output: word-by-word streaming
// { type: 'text-delta', delta: 'Why ' }
// { type: 'text-delta', delta: "don't " }
// { type: 'text-delta', delta: 'scientists ' }
```

### Redacting Sensitive Data

Buffer tool calls until complete, then redact sensitive fields before streaming to the client. See [examples/order-lookup.ts](./examples/order-lookup.ts) for the full example.

```typescript
import { flatMapUIMessageStream, partTypeIs } from "ai-stream-utils";

const tools = {
  lookupOrder: tool({
    description: "Look up order details by order ID",
    inputSchema: z.object({
      orderId: z.string().describe("The order ID to look up"),
    }),
    execute: ({ orderId }) => ({
      orderId,
      status: "shipped",
      items: ["iPhone 15"],
      total: 1299.99,
      email: "customer@example.com", // Sensitive
      address: "123 Main St, SF, CA 94102", // Sensitive
    }),
  }),
};

const result = streamText({
  model: openai("gpt-4o"),
  prompt: "Where is my order #12345?",
  tools,
});

// Buffer tool-lookupOrder parts, stream text parts immediately
const redactedStream = flatMapUIMessageStream(
  result.toUIMessageStream<MyUIMessage>(),
  partTypeIs("tool-lookupOrder"),
  ({ part }) => {
    if (part.state === "output-available") {
      return {
        ...part,
        output: {
          ...part.output,
          email: "[REDACTED]",
          address: "[REDACTED]",
        },
      };
    }
    return part;
  },
);

// Text streams immediately, tool output is redacted:
// { type: 'text-delta', delta: 'Let me look that up...' }
// { type: 'tool-output-available', output: { orderId: '12345', email: '[REDACTED]', address: '[REDACTED]' } }
```

### Conditional Part Injection

Inspect previously streamed parts to conditionally inject new parts. This example creates a text part from a tool call message if the model didn't generate one. See [examples/ask-permission.ts](./examples/ask-permission.ts) for the full example.

```typescript
import { flatMapUIMessageStream, partTypeIs } from "ai-stream-utils";

const tools = {
  askForPermission: tool({
    description: "Ask for permission to access current location",
    inputSchema: z.object({
      message: z.string().describe("The message to ask for permission"),
    }),
  }),
};

const result = streamText({
  model: openai("gpt-4o"),
  prompt: "Is it sunny today?",
  tools,
});

// Buffer askForPermission tool calls, check if text was already generated
const stream = flatMapUIMessageStream(
  result.toUIMessageStream<MyUIMessage>(),
  partTypeIs("tool-askForPermission"),
  (current, context) => {
    if (current.part.state === "input-available") {
      // Check if a text part was already streamed
      const hasTextPart = context.parts.some((p) => p.type === "text");

      if (!hasTextPart) {
        // Inject a text part from the tool call message
        return [{ type: "text", text: current.part.input.message }, current.part];
      }
    }
    return current.part;
  },
);

// If model only generated tool call, we inject the text:
// { type: 'text', text: 'May I access your location?' }
// { type: 'tool-askForPermission', input: { message: 'May I access your location?' } }
```

### Transform Tool Output

Transform tool outputs on-the-fly, such as converting temperature units. See [examples/weather.ts](./examples/weather.ts) for the full example.

```typescript
import { flatMapUIMessageStream, partTypeIs } from "ai-stream-utils";

const toFahrenheit = (celsius: number) => (celsius * 9) / 5 + 32;

const tools = {
  weather: tool({
    description: "Get the weather in a location",
    inputSchema: z.object({ location: z.string() }),
    execute: ({ location }) => ({
      location,
      temperature: 22, // Celsius from API
      unit: "C",
    }),
  }),
};

const result = streamText({
  model: openai("gpt-4o"),
  prompt: "What is the weather in Tokyo?",
  tools,
});

// Convert Celsius to Fahrenheit before streaming to client
const stream = flatMapUIMessageStream(
  result.toUIMessageStream<MyUIMessage>(),
  partTypeIs("tool-weather"),
  ({ part }) => {
    if (part.state === "output-available") {
      return {
        ...part,
        output: {
          ...part.output,
          temperature: toFahrenheit(part.output.temperature),
          unit: "F",
        },
      };
    }
    return part;
  },
);

// Output is converted:
// { type: 'tool-output-available', output: { location: 'Tokyo', temperature: 71.6, unit: 'F' } }
```

## Stream Utilities

Helper functions for converting between streams, arrays, and async iterables.

| Function                       | Converts                         | To                               |
| ------------------------------ | -------------------------------- | -------------------------------- |
| `createAsyncIterableStream`    | `ReadableStream<T>`              | `AsyncIterableStream<T>`         |
| `convertArrayToStream`         | `Array<T>`                       | `ReadableStream<T>`              |
| `convertAsyncIterableToStream` | `AsyncIterable<T>`               | `ReadableStream<T>`              |
| `convertAsyncIterableToArray`  | `AsyncIterable<T>`               | `Promise<Array<T>>`              |
| `convertStreamToArray`         | `ReadableStream<T>`              | `Promise<Array<T>>`              |
| `convertUIMessageToSSEStream`  | `ReadableStream<UIMessageChunk>` | `ReadableStream<string>`         |
| `convertSSEToUIMessageStream`  | `ReadableStream<string>`         | `ReadableStream<UIMessageChunk>` |

### `createAsyncIterableStream`

Adds async iterator protocol to a `ReadableStream`, enabling `for await...of` loops.

```typescript
import { createAsyncIterableStream } from "ai-stream-utils/utils";

const asyncStream = createAsyncIterableStream(readableStream);
for await (const chunk of asyncStream) {
  console.log(chunk);
}
```

### `convertArrayToStream`

Converts an array to a `ReadableStream` that emits each element.

```typescript
import { convertArrayToStream } from "ai-stream-utils/utils";

const stream = convertArrayToStream([1, 2, 3]);
```

### `convertAsyncIterableToStream`

Converts an async iterable (e.g., async generator) to a `ReadableStream`.

```typescript
import { convertAsyncIterableToStream } from "ai-stream-utils/utils";

async function* generator() {
  yield 1;
  yield 2;
}
const stream = convertAsyncIterableToStream(generator());
```

### `convertAsyncIterableToArray`

Collects all values from an async iterable into an array.

```typescript
import { convertAsyncIterableToArray } from "ai-stream-utils/utils";

const array = await convertAsyncIterableToArray(asyncIterable);
```

### `convertStreamToArray`

Consumes a `ReadableStream` and collects all chunks into an array.

```typescript
import { convertStreamToArray } from "ai-stream-utils/utils";

const array = await convertStreamToArray(readableStream);
```

### `convertUIMessageToSSEStream`

Converts a UI message stream to an SSE (Server-Sent Events) stream. Useful for sending UI message chunks over HTTP as SSE-formatted text.

```typescript
import { convertUIMessageToSSEStream } from "ai-stream-utils/utils";

const uiStream = result.toUIMessageStream();
const sseStream = convertUIMessageToSSEStream(uiStream);

// Output format: "data: {...}\n\n" for each chunk
```

### `convertSSEToUIMessageStream`

Converts an SSE stream back to a UI message stream. Useful for parsing SSE-formatted responses on the client.

```typescript
import { convertSSEToUIMessageStream } from "ai-stream-utils/utils";

const response = await fetch("/api/chat");
const sseStream = response.body.pipeThrough(new TextDecoderStream());
const uiStream = convertSSEToUIMessageStream(sseStream);
```

## Type Safety

The [`toUIMessageStream()`](https://ai-sdk.dev/docs/reference/ai-sdk-core/stream-text#to-ui-message-stream) from [`streamText()`](https://ai-sdk.dev/docs/reference/ai-sdk-core/stream-text) returns a generic `ReadableStream<UIMessageChunk>`, which means the part types cannot be inferred automatically.

To enable autocomplete and type-safety, pass your [`UIMessage`](https://ai-sdk.dev/docs/reference/ai-sdk-core/ui-message#creating-your-own-uimessage-type) type as a generic parameter:

```typescript
import type { UIMessage, InferUITools } from "ai";

type MyUIMessageMetadata = {};
type MyDataPart = {};
type MyTools = InferUITools<typeof tools>;

type MyUIMessage = UIMessage<MyUIMessageMetadata, MyDataPart, MyTools>;

// Use MyUIMessage type when creating the UI message stream
const uiStream = result.toUIMessageStream<MyUIMessage>();

// Type-safe filtering with autocomplete
const stream = filterUIMessageStream(
  uiStream,
  includeParts(["text", "tool-weather"]), // Autocomplete works!
);

// Type-safe chunk mapping
const stream = mapUIMessageStream(uiStream, ({ chunk, part }) => {
  // part.type is typed based on MyUIMessage
  return chunk;
});
```

## Client-Side Usage

The transformed stream has the same type as the original UI message stream. You can consume it with [`useChat()`](https://ai-sdk.dev/docs/reference/ai-sdk-ui/use-chat) or [`readUIMessageStream()`](https://ai-sdk.dev/docs/reference/ai-sdk-ui/read-ui-message-stream).

Since message parts may be different on the client vs. the server, you may need to reconcile message parts when the client sends messages back to the server.

If you save messages to a database and configure `useChat()` to [only send the last message](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-message-persistence#sending-only-the-last-message), you can read existing messages from the database. This means the model will have access to all message parts, including filtered parts not available on the client.

## Part Type Mapping

The transformations operate on [UIMessagePart](https://ai-sdk.dev/docs/reference/ai-sdk-core/ui-message#uimessagepart-types) types, which are derived from [UIMessageChunk](https://github.com/vercel/ai/blob/main/packages/ai/src/ui-message-stream/ui-message-chunks.ts) types:

| Part Type                                                                                          | Chunk Types                                                                                                                      |
| -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| [`text`](https://ai-sdk.dev/docs/reference/ai-sdk-core/ui-message#textuipart)                      | `text-start`, `text-delta`, `text-end`                                                                                           |
| [`reasoning`](https://ai-sdk.dev/docs/reference/ai-sdk-core/ui-message#reasoninguipart)            | `reasoning-start`, `reasoning-delta`, `reasoning-end`                                                                            |
| [`tool-{name}`](https://ai-sdk.dev/docs/reference/ai-sdk-core/ui-message#tooluipart)               | `tool-input-start`, `tool-input-delta`, `tool-input-available`, `tool-input-error`, `tool-output-available`, `tool-output-error` |
| [`data-{name}`](https://ai-sdk.dev/docs/reference/ai-sdk-core/ui-message#datauipart)               | `data-{name}`                                                                                                                    |
| [`step-start`](https://ai-sdk.dev/docs/reference/ai-sdk-core/ui-message#stepstartuipart)           | `start-step`                                                                                                                     |
| [`file`](https://ai-sdk.dev/docs/reference/ai-sdk-core/ui-message#fileuipart)                      | `file`                                                                                                                           |
| [`source-url`](https://ai-sdk.dev/docs/reference/ai-sdk-core/ui-message#sourceurluipart)           | `source-url`                                                                                                                     |
| [`source-document`](https://ai-sdk.dev/docs/reference/ai-sdk-core/ui-message#sourcedocumentuipart) | `source-document`                                                                                                                |

### Control Chunks

[Control chunks](https://github.com/vercel/ai/blob/main/packages/ai/src/ui-message-stream/ui-message-chunks.ts#L278-L293) always pass through regardless of filter/transform settings:

- `start`: Stream start marker
- `finish`: Stream finish marker
- `abort`: Stream abort marker
- `message-metadata`: Message metadata updates
- `error`: Error messages

### Step Boundary Handling

Step boundaries are handled automatically:

1. `start-step` is buffered until the first content chunk is encountered
2. If the first content chunk passes through, `start-step` is included
3. If the first content chunk is filtered out, `start-step` is also filtered out
4. `finish-step` is only included if the corresponding `start-step` was included

## API Reference

### `mapUIMessageStream`

```typescript
function mapUIMessageStream<UI_MESSAGE extends UIMessage>(
  stream: ReadableStream<UIMessageChunk>,
  mapFn: MapUIMessageStreamFn<UI_MESSAGE>,
): AsyncIterableStream<InferUIMessageChunk<UI_MESSAGE>>;

type MapUIMessageStreamFn<UI_MESSAGE extends UIMessage> = (
  input: MapInput<UI_MESSAGE>,
) => InferUIMessageChunk<UI_MESSAGE> | InferUIMessageChunk<UI_MESSAGE>[] | null;

type MapInput<UI_MESSAGE extends UIMessage> = {
  chunk: InferUIMessageChunk<UI_MESSAGE>;
  part: InferUIMessagePart<UI_MESSAGE>;
};
```

### `flatMapUIMessageStream`

```typescript
// Without predicate - buffer all parts
function flatMapUIMessageStream<UI_MESSAGE extends UIMessage>(
  stream: ReadableStream<UIMessageChunk>,
  flatMapFn: FlatMapUIMessageStreamFn<UI_MESSAGE>,
): AsyncIterableStream<InferUIMessageChunk<UI_MESSAGE>>;

// With predicate - buffer only matching parts, pass through others
function flatMapUIMessageStream<
  UI_MESSAGE extends UIMessage,
  PART extends InferUIMessagePart<UI_MESSAGE>,
>(
  stream: ReadableStream<UIMessageChunk>,
  predicate: FlatMapUIMessageStreamPredicate<UI_MESSAGE, PART>,
  flatMapFn: FlatMapUIMessageStreamFn<UI_MESSAGE, PART>,
): AsyncIterableStream<InferUIMessageChunk<UI_MESSAGE>>;

type FlatMapUIMessageStreamFn<
  UI_MESSAGE extends UIMessage,
  PART = InferUIMessagePart<UI_MESSAGE>,
> = (
  input: FlatMapInput<UI_MESSAGE, PART>,
  context: FlatMapContext<UI_MESSAGE>,
) => InferUIMessagePart<UI_MESSAGE> | InferUIMessagePart<UI_MESSAGE>[] | null;

type FlatMapInput<UI_MESSAGE extends UIMessage, PART = InferUIMessagePart<UI_MESSAGE>> = {
  part: PART;
};

type FlatMapContext<UI_MESSAGE extends UIMessage> = {
  index: number;
  parts: InferUIMessagePart<UI_MESSAGE>[];
};
```

#### `partTypeIs`

```typescript
function partTypeIs<UI_MESSAGE extends UIMessage, T extends InferUIMessagePartType<UI_MESSAGE>>(
  type: T | T[],
): FlatMapUIMessageStreamPredicate<
  UI_MESSAGE,
  Extract<InferUIMessagePart<UI_MESSAGE>, { type: T }>
>;

type FlatMapUIMessageStreamPredicate<
  UI_MESSAGE extends UIMessage,
  PART extends InferUIMessagePart<UI_MESSAGE>,
> = (part: InferUIMessagePart<UI_MESSAGE>) => boolean;
```

### `filterUIMessageStream`

```typescript
function filterUIMessageStream<UI_MESSAGE extends UIMessage>(
  stream: ReadableStream<UIMessageChunk>,
  filterFn: FilterUIMessageStreamPredicate<UI_MESSAGE>,
): AsyncIterableStream<InferUIMessageChunk<UI_MESSAGE>>;

type FilterUIMessageStreamPredicate<UI_MESSAGE extends UIMessage> = (
  input: MapInput<UI_MESSAGE>,
  context: MapContext<UI_MESSAGE>,
) => boolean;
```

#### `includeParts`

```typescript
function includeParts<UI_MESSAGE extends UIMessage>(
  partTypes: Array<InferUIMessagePartType<UI_MESSAGE>>,
): FilterUIMessageStreamPredicate<UI_MESSAGE>;
```

#### `excludeParts`

```typescript
function excludeParts<UI_MESSAGE extends UIMessage>(
  partTypes: Array<InferUIMessagePartType<UI_MESSAGE>>,
): FilterUIMessageStreamPredicate<UI_MESSAGE>;
```

### `consumeUIMessageStream`

```typescript
async function consumeUIMessageStream<UI_MESSAGE extends UIMessage>(
  stream: ReadableStream<InferUIMessageChunk<UI_MESSAGE>>,
): Promise<UI_MESSAGE>;
```
