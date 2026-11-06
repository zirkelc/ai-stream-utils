import { openai } from "@ai-sdk/openai";
import {
  type InferUITools,
  isStepCount,
  readUIMessageStream,
  streamText,
  tool,
  type UIMessage,
} from "ai";
import { z } from "zod";
import { pipe, redactTools } from "../src/pipe";

/**
 * Example demonstrating `redactTools()` to stream tool calls without their data.
 *
 * The client still gets each tool call with its name and state, so it can render
 * "Searching customers..." without seeing the input or the output of the tool:
 * - Input deltas are dropped and the input is replaced with `{}`
 * - The output is replaced with `null`
 */

export type MyTools = InferUITools<typeof tools>;
export type MyUIMessage = UIMessage<{}, {}, MyTools>;

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
  get_invoices: tool({
    description: `Get the invoices of a customer`,
    inputSchema: z.object({
      customerId: z.string().describe(`The id of the customer`),
    }),
    execute: ({ customerId }) => ({
      invoices: [{ id: `in_456`, customerId, amount: 4_200, status: `paid` }],
    }),
  }),
};

const result = streamText({
  model: openai(`gpt-5`),
  prompt: `Which plan is jane@example.com on, and are her invoices paid?`,
  tools,
  stopWhen: isStepCount(5),
});

/**
 * Example 1: Redact the input and the output of all tools.
 */
const stream1 = pipe(result.toUIMessageStream<MyUIMessage>()).map(redactTools()).toStream();

/**
 * Example 2: Redact a specific tool.
 * The get_invoices tool keeps its input and output.
 */
const stream2 = pipe(result.toUIMessageStream<MyUIMessage>())
  .map(redactTools(`search_customers`))
  .toStream();

/**
 * Example 3: Redact only the input.
 * The output of all tools is kept.
 */
const stream3 = pipe(result.toUIMessageStream<MyUIMessage>())
  .map(redactTools({ output: false }))
  .toStream();

/**
 * Example 4: Replace the output with a summary.
 * The client gets the number of customers, but not the customers.
 */
const stream4 = pipe(result.toUIMessageStream<MyUIMessage>())
  .map(
    redactTools(`search_customers`, {
      output: (output) => ({ count: (output as { customers: Array<unknown> }).customers.length }),
    }),
  )
  .toStream();

/**
 * On the client, the tool parts have the tool name and state, but no input or output.
 */
for await (const message of readUIMessageStream<MyUIMessage>({ stream: stream1 })) {
  for (const part of message.parts) {
    if (part.type === `tool-search_customers` || part.type === `tool-get_invoices`) {
      console.log(part);
      // { type: "tool-search_customers", state: "input-streaming", input: undefined, output: undefined, ... }
      // { type: "tool-search_customers", state: "input-available", input: {}, output: undefined, ... }
      // { type: "tool-search_customers", state: "output-available", input: {}, output: null, ... }
    }
  }
}
