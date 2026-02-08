import { openai } from "@ai-sdk/openai";
import {
  type InferUITools,
  readUIMessageStream,
  stepCountIs,
  streamText,
  tool,
  type UIMessage,
} from "ai";
import { z } from "zod";
import { flatMapUIMessageStream, partTypeIs } from "../src/flat-map-ui-message-stream";

export type MyMetadata = { id: string };
export type MyDataPart = {};
export type MyTools = InferUITools<typeof tools>;
export type MyUIMessage = UIMessage<MyMetadata, MyDataPart, MyTools>;

const tools = {
  askForPermission: tool({
    description: "Ask for permission to access current location",
    inputSchema: z.object({
      message: z.string().describe("The message to ask for permission"),
    }),
  }),
};

// The model will generate tool call with a message to ask for permission
// It may also generate a text part before the tool call asking for permission
const result = streamText({
  model: openai("gpt-5"),
  prompt: "Is it sunny today?",
  tools,
  stopWhen: stepCountIs(5),
});

const uiMessageStream = result.toUIMessageStream<MyUIMessage>();

// FlatMap buffers askForPermission calls until the input is available and calls the function
// We inspect the previously generated parts to see if the model generated a text part already
// If it has generated a text part already, we can use this
// If not, we can use the tool call message to "create" a text part
const flatMappedStream = flatMapUIMessageStream(
  uiMessageStream,
  // Predicate to only buffer tool-askForPermission parts and pass through other parts
  partTypeIs("tool-askForPermission"),

  // Current: contains the buffered tool call part
  // Context: contains the previous parts already streamed to the client
  (current, context) => {
    // Part is already typed as tool-askForPermission due to the predicate
    const toolPart = current.part;

    // Check state to see if it has input available
    if (toolPart.state === "input-available") {
      // Did the model generate a text part already?
      const textPart = context.parts.find((part) => part.type === "text");

      // If no text part was generated before the tool call, we will create one
      if (!textPart) {
        // New: Returning an array to expand the part into multiple parts
        return [
          // New text part with the tool call message
          { type: "text", text: toolPart.input.message },
          // Original tool call part
          toolPart,
        ];
      }
    }

    return current.part;
  },
);

for await (const chunk of readUIMessageStream({ stream: flatMappedStream })) {
  console.log(chunk);
}
// UI message example:
// {
//   id: '1',
//   role: 'assistant',
//   parts: [
//     { type: 'step-start' },
//     {
//       type: 'text',
//       text: 'To check if it’s sunny where you are today, may I access your current location?',
//       state: 'done'
//     },
//     {
//       type: 'tool-askForPermission',
//       toolCallId: 'call_yKu7XnfGJJQvDpyhp9pgmXDb',
//       state: 'input-available',
//       input: { message: 'To check if it’s sunny where you are today, may I access your current location?' },
//     }
//   ]
// }
