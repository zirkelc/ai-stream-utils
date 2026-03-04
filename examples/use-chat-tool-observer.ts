import { useChat, type UIMessage } from "@ai-sdk/react";
import { InferUIMessageChunk, type InferUITools, tool, UIMessageChunk } from "ai";
import { z } from "zod";
import { pipe, toolCall } from "../src/pipe";
import { convertSSEToUIMessageStream } from "../src/utils/convert-sse-stream-to-ui-message-stream";

declare function fetchWeather(city: string): Promise<{ temperature: number; conditions: string }>;

/**
 * Example: Using pipe().on(toolCall()) with useChat's custom transport.
 *
 * This shows how to observe tool state transitions in a React client
 * by wrapping the UIMessage stream in the transport's sendMessage handler.
 */

const tools = {
  getWeather: tool({
    description: "Get the weather in a location",
    inputSchema: z.object({
      city: z.string(),
    }),
    needsApproval: true,
    execute: async ({ city }) => {
      const weather = await fetchWeather(city);
      return weather;
    },
  }),
};

type MyTools = InferUITools<typeof tools>;
type MyUIMessage = UIMessage<{}, {}, MyTools>;

export function Chat() {
  const { messages, sendMessage } = useChat({
    transport: {
      sendMessages: async (opts) => {
        const { messages, abortSignal, chatId } = opts;
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages }),
          signal: abortSignal,
        });

        if (!response.body) {
          throw new Error("Response body is null");
        }

        const stream = convertSSEToUIMessageStream<MyUIMessage>(
          response.body.pipeThrough(new TextDecoderStream()),
        );

        return pipe(stream)
          .on(toolCall(), ({ chunk, part }) => {
            console.log(`[Tool] ${part.type} → ${chunk.type}`);
          })
          .on(toolCall({ tool: "weather", state: "output-available" }), ({ chunk, part }) => {
            console.log(`[Tool Complete]`, chunk.output);
          })
          .toStream();
      },
      reconnectToStream: async (opts) => {
        throw new Error("Not implemented");
      },
    },
  });

  // return (
  //   <div>
  //     {messages.map((m) => (
  //       <div key={m.id}>{m.content}</div>
  //     ))}
  //     <form onSubmit={handleSubmit}>
  //       <input value={input} onChange={handleInputChange} />
  //     </form>
  //   </div>
  // );
}
