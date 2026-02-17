import { openai } from "@ai-sdk/openai";
import { streamText, tool } from "ai";
import { excludeParts, pipe, includeParts } from "../src/index.js";
import z from "zod";

const result = streamText({
  model: openai("gpt-5"),
  prompt: "Tell me a joke.",
  tools: {
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
  },
});

const stream = pipe(result.toUIMessageStream())
  .filter(includeParts(["text", "reasoning"])) // Filter narrows type to TextUIPart | ReasoningUIPart
  .filter(excludeParts(["reasoning"])) // Filter narrows type to TextUIPart
  .map(({ chunk, part }) => {
    // Part is typed as TextUIPart
    // Chunk is typed as 'text-start' | 'text-delta' | 'text-end'
    if (chunk.type === "text-delta") {
      return { ...chunk, delta: chunk.delta.toUpperCase() };
    }

    return chunk;
  })
  .toStream();

for await (const chunk of stream) {
  console.log(chunk);
}
