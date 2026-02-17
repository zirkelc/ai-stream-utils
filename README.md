<div align='center'>

# ai-stream-utils

<p align="center">AI SDK: Stream transformation utilities for UI message streams</p>
<p align="center">
  <a href="https://www.npmjs.com/package/ai-stream-utils" alt="ai-stream-utils"><img src="https://img.shields.io/npm/dt/ai-stream-utils?label=ai-stream-utils"></a> <a href="https://github.com/zirkelc/ai-stream-utils/actions/workflows/ci.yml" alt="CI"><img src="https://img.shields.io/github/actions/workflow/status/zirkelc/ai-stream-utils/ci.yml?branch=main"></a>
</p>

</div>

This library provides composable filter and transformation utilities for UI message streams created by [`streamText()`](https://ai-sdk.dev/docs/reference/ai-sdk-core/stream-text) in the AI SDK.

### Why?

The AI SDK UI message stream created by [`toUIMessageStream()`](https://ai-sdk.dev/docs/reference/ai-sdk-core/stream-text#to-ui-message-stream) streams all parts (text, tools, reasoning, etc.) to the client by default. However, you may want to:

- **Filter**: Tool calls like database queries often contain large amounts of data or sensitive information that should not be streamed to the client
- **Transform**: Modify text or tool outputs while they are streamed to the client
- **Observe**: Log stream lifecycle events, tool calls, or other chunks without consuming or modifying the stream

This library provides type-safe, composable utilities for all these use cases.

### Installation

This library supports AI SDK v5 and v6.

```bash
npm install ai-stream-utils
```

## Usage

The `pipe` function provides a composable pipeline API for filtering, transforming, and observing UI message streams. Multiple operators can be chained together, and type guards automatically narrow chunk and part types, thus enabling type-safe stream transformations with autocomplete.

### `.filter()`

Filter chunks by returning `true` to keep or `false` to exclude.

```typescript
const stream = pipe(result.toUIMessageStream())
  .filter(({ chunk, part }) => {
    // chunk.type: "text-delta" | "text-start" | "tool-input-available" | ...
    // part.type: "text" | "reasoning" | "tool-weather" | ...

    if (chunk.type === "data-weather") {
      return false; // exclude chunk
    }

    return true; // keep chunk
  })
  .toStream();
```

**Type guards** provide a simpler API for common filtering patterns:

- `includeChunks("text-delta")` or `includeChunks(["text-delta", "text-end"])`: Include specific chunk types
- `excludeChunks("text-delta")` or `excludeChunks(["text-delta", "text-end"])`: Exclude specific chunk types
- `includeParts("text")` or `includeParts(["text", "reasoning"])`: Include specific part types
- `excludeParts("reasoning")` or `excludeParts(["reasoning", "tool-database"])`: Exclude specific part types

**Example:** Exclude tool calls from the client.

```typescript
const stream = pipe(result.toUIMessageStream())
  .filter(excludeParts(["tool-weather", "tool-database"]))
  .toStream();
```

### `.map()`

Transform chunks by returning a chunk, an array of chunks, or `null` to exclude.

```typescript
const stream = pipe(result.toUIMessageStream())
  .map(({ chunk, part }) => {
    // chunk.type: "text-delta" | "text-start" | "tool-input-available" | ...
    // part.type: "text" | "reasoning" | "tool-weather" | ...

    if (chunk.type === "text-start") {
      return chunk; // pass through unchanged
    }

    if (chunk.type === "text-delta") {
      return { ...chunk, delta: "modified" }; // transform chunk
    }

    if (chunk.type === "data-weather") {
      return [chunk1, chunk2]; // emit multiple chunks
    }

    return null; // exclude chunk (same as filter)
  })
  .toStream();
```

**Example:** Convert text to uppercase.

```typescript
const stream = pipe(result.toUIMessageStream())
  .map(({ chunk }) => {
    if (chunk.type === "text-delta") {
      return { ...chunk, delta: chunk.delta.toUpperCase() };
    }

    return chunk;
  })
  .toStream();
```

### `.on()`

Observe chunks without modifying the stream. The callback is invoked for matching chunks.

```typescript
const stream = pipe(result.toUIMessageStream())
  .on(
    ({ chunk, part }) => {
      // return true to invoke callback, false to skip
      return chunk.type === "text-delta";
    },
    ({ chunk, part }) => {
      // callback invoked for matching chunks
      console.log(chunk, part);
    },
  )
  .toStream();
```

**Type guard** provides a type-safe way to observe specific chunk types:

- `chunkType("text-delta")` or `chunkType(["start", "finish"])`: Observe specific chunk types
- `partType("text")` or `partType(["text", "reasoning"])`: Observe chunks belonging to specific part types

> [!NOTE]
> The `partType` type guard still operates on chunks. That means `partType("text")` will match any text chunks such as `text-start`, `text-delta`, and `text-end`.

**Example:** Log stream lifecycle events.

```typescript
const stream = pipe(result.toUIMessageStream())
  .on(chunkType("start"), () => {
    console.log("Stream started");
  })
  .on(chunkType("finish"), ({ chunk }) => {
    console.log("Stream finished:", chunk.finishReason);
  })
  .on(chunkType("tool-input-available"), ({ chunk }) => {
    console.log("Tool called:", chunk.toolName, chunk.input);
  })
  .toStream();
```

### `.toStream()`

Convert the pipeline back to a `AsyncIterableStream<InferUIMessageChunk<UI_MESSAGE>>` that can be returned to the client or consumed.

```typescript
const stream = pipe(result.toUIMessageStream())
  .filter(({ chunk }) => {})
  .map(({ chunk }) => {})
  .toStream();

// Iterate with for-await-of
for await (const chunk of stream) {
  console.log(chunk);
}

// Consume as ReadableStream
for await (const message of readUIMessageStream({ stream })) {
  console.log(message);
}

// Return to client with useChat()
return stream;
```

### Chaining and Type Narrowing

Multiple operators can be chained together. After filtering with type guards, chunk and part types are narrowed automatically.

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

### Control Chunks

[Control chunks](https://github.com/vercel/ai/blob/main/packages/ai/src/ui-message-stream/ui-message-chunks.ts#L278-L293) always pass through regardless of filter/transform settings:

- `start`: Stream start marker
- `finish`: Stream finish marker
- `abort`: Stream abort marker
- `message-metadata`: Message metadata updates
- `error`: Error messages

## Stream Utilities

Helper functions for consuming streams and converting between streams, arrays, and async iterables.

### `consumeUIMessageStream`

Consumes a UI message stream by fully reading it and returns the final assembled message. Useful for server-side processing without streaming to the client.

```typescript
import { consumeUIMessageStream } from "ai-stream-utils";

const result = streamText({
  model: openai("gpt-4o"),
  prompt: "Tell me a joke",
});

const message = await consumeUIMessageStream(result.toUIMessageStream<MyUIMessage>());

console.log(message.parts); // All parts fully assembled
```

### `createAsyncIterableStream`

Adds async iterator protocol to a `ReadableStream`, enabling `for await...of` loops.

```typescript
import { createAsyncIterableStream } from "ai-stream-utils";

const asyncStream = createAsyncIterableStream(readableStream);
for await (const chunk of asyncStream) {
  console.log(chunk);
}
```

### `convertArrayToStream`

Converts an array to a `ReadableStream` that emits each element.

```typescript
import { convertArrayToStream } from "ai-stream-utils";

const stream = convertArrayToStream([1, 2, 3]);
```

### `convertAsyncIterableToStream`

Converts an async iterable (e.g., async generator) to a `ReadableStream`.

```typescript
import { convertAsyncIterableToStream } from "ai-stream-utils";

async function* generator() {
  yield 1;
  yield 2;
}
const stream = convertAsyncIterableToStream(generator());
```

### `convertAsyncIterableToArray`

Collects all values from an async iterable into an array.

```typescript
import { convertAsyncIterableToArray } from "ai-stream-utils";

const array = await convertAsyncIterableToArray(asyncIterable);
```

### `convertStreamToArray`

Consumes a `ReadableStream` and collects all chunks into an array.

```typescript
import { convertStreamToArray } from "ai-stream-utils";

const array = await convertStreamToArray(readableStream);
```

### `convertUIMessageToSSEStream`

Converts a UI message stream to an SSE (Server-Sent Events) stream. Useful for sending UI message chunks over HTTP as SSE-formatted text.

```typescript
import { convertUIMessageToSSEStream } from "ai-stream-utils";

const uiStream = result.toUIMessageStream();
const sseStream = convertUIMessageToSSEStream(uiStream);

// Output format: "data: {...}\n\n" for each chunk
```

### `convertSSEToUIMessageStream`

Converts an SSE stream back to a UI message stream. Useful for parsing SSE-formatted responses on the client.

```typescript
import { convertSSEToUIMessageStream } from "ai-stream-utils";

const response = await fetch("/api/chat");
const sseStream = response.body.pipeThrough(new TextDecoderStream());
const uiStream = convertSSEToUIMessageStream(sseStream);
```

## Deprecated Functions

> [!WARNING]
> These functions are deprecated and will be removed in a future version. Use `pipe()` instead.

### `mapUIMessageStream`

```typescript
import { mapUIMessageStream } from "ai-stream-utils";

const stream = mapUIMessageStream(result.toUIMessageStream(), ({ chunk }) => {
  if (chunk.type === "text-delta") {
    return { ...chunk, delta: chunk.delta.toUpperCase() };
  }
  return chunk;
});
```

### `filterUIMessageStream`

```typescript
import { filterUIMessageStream, includeParts } from "ai-stream-utils";

const stream = filterUIMessageStream(
  result.toUIMessageStream(),
  includeParts(["text", "tool-weather"]),
);
```

### `flatMapUIMessageStream`

```typescript
import { flatMapUIMessageStream, partTypeIs } from "ai-stream-utils";

const stream = flatMapUIMessageStream(
  result.toUIMessageStream(),
  partTypeIs("tool-weather"),
  ({ part }) => {
    if (part.state === "output-available") {
      return {
        ...part,
        output: { ...part.output, temperature: toFahrenheit(part.output.temperature) },
      };
    }
    return part;
  },
);
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
const stream = pipe<MyUIMessage>(uiStream)
  .filter(includeParts(["text", "tool-weather"])) // Autocomplete works!
  .map(({ chunk, part }) => {
    // part.type is typed based on MyUIMessage
    return chunk;
  })
  .toStream();
```

## Client-Side Usage

The transformed stream has the same type as the original UI message stream. You can consume it with [`useChat()`](https://ai-sdk.dev/docs/reference/ai-sdk-ui/use-chat) or [`readUIMessageStream()`](https://ai-sdk.dev/docs/reference/ai-sdk-ui/read-ui-message-stream).

Since message parts may be different on the client vs. the server, you may need to reconcile message parts when the client sends messages back to the server.

If you save messages to a database and configure `useChat()` to [only send the last message](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-message-persistence#sending-only-the-last-message), you can read existing messages from the database. This means the model will have access to all message parts, including filtered parts not available on the client.
