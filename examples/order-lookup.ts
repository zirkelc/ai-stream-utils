import { openai } from "@ai-sdk/openai";
import { type InferUITools, stepCountIs, streamText, tool, type UIMessage } from "ai";
import { z } from "zod";
import { flatMapUIMessageStream, partTypeIs } from "../src/flat-map-ui-message-stream";

export type MyMetadata = { id: string };
export type MyDataPart = {};
export type MyTools = InferUITools<typeof tools>;
export type MyUIMessage = UIMessage<MyMetadata, MyDataPart, MyTools>;

const tools = {
  lookupOrder: tool({
    description: "Look up order details by order ID",
    inputSchema: z.object({
      orderId: z.string().describe("The order ID to look up"),
    }),
    execute: ({ orderId }) => {
      return {
        orderId,
        status: "shipped",
        items: ["iPhone 15"],
        total: 1299.99,
        email: "customer@example.com",
        address: "123 Main St, San Francisco, CA 94102",
      };
    },
  }),
};

const result = streamText({
  model: openai("gpt-4o"),
  prompt: "Where is my order #12345?",
  tools,
  stopWhen: stepCountIs(5),
});

const uiMessageStream = result.toUIMessageStream<MyUIMessage>();

// FlatMap: Buffer tool-call chunks until complete, then redact sensitive fields
const flatMappedStream = flatMapUIMessageStream(
  uiMessageStream,
  // Buffer only tool-lookupOrder parts
  partTypeIs("tool-lookupOrder"),
  ({ part }) => {
    // Part is already typed as tool-lookupOrder due to the predicate
    // Onyl use the part.state to check if the part already has output available
    if (part.state === "output-available") {
      const { output } = part;
      return {
        ...part,
        output: {
          ...output,
          email: "[REDACTED]",
          address: "[REDACTED]",
        },
      };
    }

    return part;
  },
);

for await (const chunk of flatMappedStream) {
  console.log(chunk);
}
// Text chunks stream through immediately:
// { type: 'text-start' }
// { type: 'text-delta', delta: 'Let me' }
// { type: 'text-delta', delta: ' have a' }
// { type: 'text-delta', delta: ' look!' }
// { type: 'text-end' }

// Tool-call chunks are buffered until part is complete and then transformed:
// { type: 'tool-input-start' }
// { type: 'tool-input-available'', input: { orderId: '12345' } }
// { type: 'tool-output-available', output: { orderId: '12345', status: 'shipped', items: ['iPhone 15'],  total: 1299.99, email: '[REDACTED]', address: '[REDACTED]' } }

// Text chunks stream through immediately:
// { type: 'text-start' }
// { type: 'text-delta', delta: 'The order' }
// { type: 'text-delta', delta: ' #12345' }
// { type: 'text-delta', delta: ' is on its' }
// { type: 'text-delta', delta: ' way to San' }
// { type: 'text-delta', delta: ' Francisco!' }
// { type: 'text-end' }
