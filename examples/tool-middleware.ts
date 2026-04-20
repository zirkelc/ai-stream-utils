import "dotenv/config";
import { openai } from "@ai-sdk/openai";
import { type InferUITools, stepCountIs, streamText, tool, type UIMessage } from "ai";
import { z } from "zod";
import { pipe, toolCall } from "../src/pipe";

const tools = {
  weather: tool({
    description: `Get the current weather for a location`,
    inputSchema: z.object({
      location: z.string().describe(`The location to get the weather for`),
    }),
    execute: ({ location }) => ({
      location,
      temperature: 72 + Math.floor(Math.random() * 21) - 10,
      conditions: `sunny`,
    }),
  }),
  search: tool({
    description: `Search the web for recent information`,
    inputSchema: z.object({
      query: z.string().describe(`The search query`),
    }),
    /** Intentionally throws to demonstrate the `output-error` path. */
    execute: (): { query: string; results: Array<string> } => {
      throw new Error(`Search API rate limited`);
    },
  }),
};

type MyTools = InferUITools<typeof tools>;
type MyUIMessage = UIMessage<{}, {}, MyTools>;

const result = streamText({
  model: openai(`gpt-5`),
  prompt: `What's the weather in Tokyo? Also search the web for "ai sdk v6 release notes".`,
  tools,
  stopWhen: stepCountIs(5),
});

const errors: Array<{ tool: string; toolCallId: string; error: string }> = [];

const stream = pipe<MyUIMessage>(result.toUIMessageStream())
  /** onCall */
  .on(toolCall({ state: `input-available` }), ({ chunk, part }) => {
    console.log(`[onCall]   ${part.type} (${chunk.toolCallId}) input=`, chunk.input);
  })
  /** onResult */
  .on(toolCall({ state: `output-available` }), ({ chunk, part }) => {
    console.log(`[onResult] ${part.type} (${chunk.toolCallId}) output=`, chunk.output);
  })
  /** onError */
  .on(toolCall({ state: `output-error` }), ({ chunk, part }) => {
    errors.push({
      tool: part.type,
      toolCallId: chunk.toolCallId,
      error: chunk.errorText,
    });
    console.log(`[onError]  ${part.type} (${chunk.toolCallId}) error=`, chunk.errorText);
  })
  .toStream();

for await (const _ of stream) {
  /** drain the stream so observers fire */
}

// [onCall]   tool-weather (call_nGpoKqeviVdt0kifjMa73sW8) input= { location: 'Tokyo' }
// [onResult] tool-weather (call_nGpoKqeviVdt0kifjMa73sW8) output= { location: 'Tokyo', temperature: 66, conditions: 'sunny' }
// [onCall]   tool-search (call_tcTJvl8xrRvGxLsGw9EFXOcV) input= { query: 'ai sdk v6 release notes' }
// [onError]  tool-search (call_tcTJvl8xrRvGxLsGw9EFXOcV) error= Search API rate limited
