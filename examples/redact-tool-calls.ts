import { openai } from "@ai-sdk/openai";
import { isStepCount, readUIMessageStream, streamText, tool } from "ai";
import { z } from "zod";
import { pipe } from "../src/pipe";

/**
 * Example demonstrating how to stream only the tool names to the client.
 * The client still gets each tool call with its state (input-streaming, input-available, output-available),
 * so it can render "Searching customers..." without seeing the input or the output of the tool.
 */

// Runs on the server
async function sendMessage() {
  const tools = {
    search_customers: tool({
      description: `Search the customer database`,
      inputSchema: z.object({
        email: z.string().describe(`The email address of the customer`),
      }),
      execute: ({ email }) => ({
        customers: [{ id: `cus_123`, email, plan: `enterprise`, mrr: 4_200 }],
      }),
    }),
  };

  const result = streamText({
    model: openai(`gpt-5`),
    prompt: `Which plan is jane@example.com on?`,
    tools,
    stopWhen: isStepCount(5),
  });

  return pipe(result.toUIMessageStream())
    .map(({ chunk }) => {
      // Omit the input and output of each tool chunk
      switch (chunk.type) {
        case `tool-input-delta`:
          return null;
        case `tool-input-available`:
          return { ...chunk, input: {} };
        case `tool-input-error`:
          return { ...chunk, input: {} };
        case `tool-output-available`:
          return { ...chunk, output: null };
        case `tool-output-error`:
          return { ...chunk };
        default:
          return chunk;
      }
    })
    .toStream();
}

// Runs on the client
const stream = await sendMessage();

for await (const message of readUIMessageStream({ stream })) {
  for (const part of message.parts) {
    if (part.type === `tool-search_customers`) {
      // TODO: render tool call with tool name
      console.log(part);
      // { type: "tool-search_customers", state: "input-streaming", input: undefined, output: undefined, ... }
      // { type: "tool-search_customers", state: "input-available", input: {}, output: undefined, ... }
      // { type: "tool-search_customers", state: "output-available", input: {}, output: null, ... }
    }
  }
}
