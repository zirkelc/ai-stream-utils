# Tweet: ai-stream-utils v3.0.0

## Tweet (262 chars)

In the next version of ai-stream-utils: AI SDK v7 support.

Filter and transform UI message streams from streamText() before they reach the client.

filter(), map() and on() now take async callbacks, so you can await inside the pipeline

npm i ai-stream-utils@v3

## Code snippet

```ts
import { openai } from "@ai-sdk/openai";
import { type InferUITools, streamText, tool, type UIDataTypes, type UIMessage } from "ai";
import { chunkType, excludeTools, pipe } from "ai-stream-utils";
import { z } from "zod";

const tools = {
  weather: tool({
    description: "Get the weather in a location",
    inputSchema: z.object({ location: z.string() }),
    execute: ({ location }) => ({ location, temperature: 72 }),
  }),
};

type MyUIMessage = UIMessage<unknown, UIDataTypes, InferUITools<typeof tools>>;

const result = streamText({
  model: openai("gpt-5"),
  prompt: "What is the weather in Tokyo?",
  tools,
});

const stream = pipe<MyUIMessage>(result.toUIMessageStream<MyUIMessage>())
  .filter(excludeTools("weather"))
  .map(async ({ chunk }) => {
    if (chunk.type !== "file") return chunk;

    // download the file and convert it to base64
    const base64 = await downloadAsBase64(chunk.url);
    return { ...chunk, url: `data:${chunk.mediaType};base64,${base64}` };
  })
  .on(chunkType("file"), ({ chunk }) => {
    // chunk is narrowed to the right type chunk.type === "file"
    console.log(chunk.url);
    // data:image/png;base64,iVBORw0KG...
  })
  .toStream();
```

## Async line alternatives

| #   | Line                                                                                    | Total |
| --- | --------------------------------------------------------------------------------------- | ----- |
| 0   | Now even with async support                                                             | 202   |
| 1   | filter(), map() and on() now take async callbacks                                       | 224   |
| 2   | map() is now async, so you can await inside a transform                                 | 230   |
| 3   | Now with async filter(), map() and on()                                                 | 214   |
| 4   | map() now takes an async callback, so a chunk can be rewritten from an awaited result   | 260   |
| 5   | filter(), map() and on() now take async callbacks, so you can await inside the pipeline | 262   |

## Links

- repo: github.com/zirkelc/ai-stream-utils
- npm: npmjs.com/package/ai-stream-utils

## Before posting

- Async map/filter/on is uncommitted. It needs a `feat:` commit on main, or 3.0.0 ships without it and the async line is false.
- `npm i ai-stream-utils@v3` does not resolve until PR #22 merges and 3.0.0 publishes.
