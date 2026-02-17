import { openai } from "@ai-sdk/openai";
import { type InferUITools, stepCountIs, streamText, tool, type UIMessage } from "ai";
import { z } from "zod";
import { flatMapUIMessageStream, partTypeIs } from "../src/flat-map";
import { excludeParts, includeParts, pipe } from "../src/pipe";

export type MyMetadata = { id: string };
export type MyDataPart = { weather: { location: string; temperature: number } };
export type MyTools = InferUITools<typeof tools>;
export type MyUIMessage = UIMessage<MyMetadata, MyDataPart, MyTools>;

const toFahrenheit = (temperature: number) => {
  return (temperature * 9) / 5 + 32;
};

const tools = {
  weather: tool({
    description: "Get the weather in a location",
    inputSchema: z.object({
      location: z.string().describe("The location to get the weather for"),
    }),
    execute: ({ location }) => ({
      location,
      temperature: 72 + Math.floor(Math.random() * 21) - 10,
      unit: "C",
    }),
  }),
};

const result = streamText({
  model: openai("gpt-5"),
  prompt: "What is the weather in Tokyo?",
  tools,
  stopWhen: stepCountIs(5),
});

const stream = pipe(result.toUIMessageStream<MyUIMessage>())
  .filter(excludeParts(["tool-weather"]))
  .filter(includeParts(["text", "data-weather"]))
  .map(({ chunk, part }) => {
    if (chunk.type === "data-weather") {
      return {
        ...chunk,
        data: {
          ...chunk.data,
          temperature: toFahrenheit(chunk.data.temperature),
          unit: "F",
        },
      };
    }

    return chunk;
  })
  .toStream();

for await (const chunk of stream) {
  console.log(chunk);
}
