import { openai } from "@ai-sdk/openai";
import { type InferUITools, stepCountIs, streamText, tool, type UIMessage } from "ai";
import { z } from "zod";
import { pipe, toolCall } from "../src/pipe";

/**
 * Example demonstrating `toolCall()` observer for tool state transitions.
 *
 * The `toolCall()` guard observes tool state transitions without filtering.
 * It matches specific chunk types that represent "final" tool states:
 * - `input-available`: Tool input has been fully parsed
 * - `approval-requested`: Tool requires user approval before execution
 * - `output-available`: Tool execution completed successfully
 * - `output-error`: Tool execution failed with an error
 * - `output-denied`: User denied tool execution approval
 *
 * Streaming chunks (tool-input-start, tool-input-delta) are NOT matched.
 */

export type MyTools = InferUITools<typeof tools>;
export type MyUIMessage = UIMessage<{}, {}, MyTools>;

const tools = {
  weather: tool({
    description: `Get the weather in a location`,
    inputSchema: z.object({
      location: z.string().describe(`The location to get weather for`),
    }),
    needsApproval: true,
    execute: ({ location }) => ({
      location,
      temperature: 72,
      conditions: `sunny`,
    }),
  }),
  calculator: tool({
    description: `Calculate a mathematical expression`,
    inputSchema: z.object({
      expression: z.string().describe(`The expression to calculate`),
    }),
    execute: ({ expression }) => ({
      result: eval(expression),
    }),
  }),
};

const result = streamText({
  model: openai(`gpt-5`),
  prompt: `What's the weather in Tokyo and calculate 2+2?`,
  tools,
  stopWhen: stepCountIs(5),
});

/**
 * Example 1: Observe ALL tool state transitions.
 * Useful for logging all tool activity.
 */
const stream1 = pipe(result.toUIMessageStream<MyUIMessage>())
  .on(toolCall(), ({ chunk, part }) => {
    console.log(`[Tool] ${part.type} → ${chunk.type}`);
  })
  .toStream();

/**
 * Example 2: Observe a specific tool.
 * Only the weather tool's state transitions are logged.
 */
const stream2 = pipe(result.toUIMessageStream<MyUIMessage>())
  .on(toolCall({ tool: `weather` }), ({ chunk }) => {
    console.log(`[Weather] ${chunk.type}`);
  })
  .toStream();

/**
 * Example 3: Observe a specific state.
 * Only tool-output-available chunks are observed.
 */
const stream3 = pipe(result.toUIMessageStream<MyUIMessage>())
  .on(toolCall({ state: "output-available" }), ({ chunk, part }) => {
    console.log(`[Tool Complete] ${part.type} output:`, chunk.output);
  })
  .toStream();

/**
 * Example 4: Observe specific tool AND state.
 * Only the weather tool's output-available is observed.
 */
const stream4 = pipe(result.toUIMessageStream<MyUIMessage>())
  .on(toolCall({ tool: "weather", state: "approval-requested" }), ({ chunk, part }) => {
    console.log(`[Weather Approval] ${part.type} needs approval`);
  })
  .toStream();

/**
 * Example 5: Observe multiple states.
 * Chain multiple .on() calls for different states.
 */
const stream5 = pipe(result.toUIMessageStream<MyUIMessage>())
  .on(toolCall({ state: `input-available` }), ({ part }) => {
    console.log(`[Tool Input] ${part.type}:`);
  })
  .on(toolCall({ state: `output-available` }), ({ part }) => {
    console.log(`[Tool Output] ${part.type}:`);
  })
  .toStream();

/**
 * Example 6: Observe multiple tools.
 * Chain multiple .on() calls for different tools.
 */
const stream6 = pipe(result.toUIMessageStream<MyUIMessage>())
  .on(toolCall({ tool: `weather` }), ({ chunk, part }) => {
    console.log(`[Weather Tool] ${part.type} → ${chunk.type}`);
  })
  .on(toolCall({ tool: `calculator` }), ({ chunk, part }) => {
    console.log(`[Calculator Tool] ${part.type} → ${chunk.type}`);
  })
  .toStream();

/**
 * Example 7: Chain multiple observers.
 * Different handlers for different tools.
 */
const stream7 = pipe(result.toUIMessageStream<MyUIMessage>())
  .on(toolCall({ tool: `weather`, state: `output-available` }), ({ chunk }) => {
    console.log(`Weather result:`, chunk.output);
  })
  .on(toolCall({ tool: `calculator`, state: `output-available` }), ({ chunk }) => {
    console.log(`Calculator result:`, chunk.output);
  })
  .toStream();
