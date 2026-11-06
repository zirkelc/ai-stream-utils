import type { InferUIMessageChunk, UIMessage } from "ai";
import type { InferToolName } from "../types.js";
import type { ChunkMapFn } from "./types.js";

/**
 * A composable helper that plugs into the `.map()` operator to remove the input
 * and the output of tool calls before the stream reaches the client. The client
 * still receives each tool call with its name, id and state.
 *
 * @example
 * ```typescript
 * pipe<MyUIMessage>(stream)
 *   .map(redactTools('search_customers'))
 *   .toStream();
 * ```
 */

/**
 * `true` replaces the value with the default placeholder, `false` keeps it, and a
 * function replaces it with the return value of the function.
 */
export type RedactToolsReplacer = boolean | ((value: unknown) => unknown);

export type RedactToolsOptions = {
  /** Drop input deltas and replace the input. The default placeholder is `{}`. Defaults to `true`. */
  input?: RedactToolsReplacer;
  /** Replace the output. The default placeholder is `null`. Defaults to `true`. */
  output?: RedactToolsReplacer;
};

/** Normalizes an option to a replace function, or `undefined` to keep the value. */
function toReplaceFn(
  replacer: RedactToolsReplacer,
  placeholder: () => unknown,
): ((value: unknown) => unknown) | undefined {
  if (replacer === false) return undefined;
  if (replacer === true) return placeholder;
  return replacer;
}

type RedactToolsMapFn<UI_MESSAGE extends UIMessage> = ChunkMapFn<
  UI_MESSAGE,
  InferUIMessageChunk<UI_MESSAGE>,
  { type: string }
>;

/**
 * Creates a `.map()` callback that redacts the input and the output of all or only
 * specific tools. Input deltas are dropped, the input of `tool-input-available` and
 * `tool-input-error` chunks is replaced with `{}`, and the output of
 * `tool-output-available` chunks is replaced with `null`. Error texts are not changed.
 * Pass a function as `input` or `output` to replace the value with its return value.
 *
 * @example
 * ```typescript
 * pipe<MyUIMessage>(stream).map(redactTools()); // all tools
 * pipe<MyUIMessage>(stream).map(redactTools('weather')); // one tool
 * pipe<MyUIMessage>(stream).map(redactTools(['weather', 'calculator'])); // some tools
 * pipe<MyUIMessage>(stream).map(redactTools({ output: false })); // all tools, input only
 * pipe<MyUIMessage>(stream).map(redactTools('weather', { input: false })); // one tool, output only
 * pipe<MyUIMessage>(stream).map(redactTools({ output: () => ({}) })); // replace the output with {}
 * ```
 */
export function redactTools<UI_MESSAGE extends UIMessage>(
  options?: RedactToolsOptions,
): RedactToolsMapFn<UI_MESSAGE>;
export function redactTools<
  UI_MESSAGE extends UIMessage,
  TOOL_NAME extends InferToolName<UI_MESSAGE>,
>(
  toolNames: TOOL_NAME | Array<TOOL_NAME>,
  options?: RedactToolsOptions,
): RedactToolsMapFn<UI_MESSAGE>;
export function redactTools<UI_MESSAGE extends UIMessage>(
  toolNamesOrOptions?: string | Array<string> | RedactToolsOptions,
  maybeOptions?: RedactToolsOptions,
): RedactToolsMapFn<UI_MESSAGE> {
  const hasToolNames = typeof toolNamesOrOptions === `string` || Array.isArray(toolNamesOrOptions);
  const toolNames = hasToolNames ? toolNamesOrOptions : undefined;
  const { input = true, output = true } = (hasToolNames ? maybeOptions : toolNamesOrOptions) ?? {};
  const replaceInput = toReplaceFn(input, () => ({}));
  const replaceOutput = toReplaceFn(output, () => null);

  const partTypes =
    toolNames === undefined
      ? undefined
      : (Array.isArray(toolNames) ? toolNames : [toolNames]).map((name) => `tool-${name}`);

  return ({ chunk, part }) => {
    // No tool names redacts all tools, including dynamic tools
    const isTool =
      partTypes === undefined
        ? part.type.startsWith(`tool-`) || part.type === `dynamic-tool`
        : partTypes.includes(part.type);
    if (!isTool) return chunk;

    if (replaceInput) {
      // The deltas are the raw JSON text of the input, so they are dropped even with a function
      if (chunk.type === `tool-input-delta`) return null;
      if (chunk.type === `tool-input-available` || chunk.type === `tool-input-error`) {
        return { ...chunk, input: replaceInput((chunk as { input: unknown }).input) };
      }
    }

    if (replaceOutput && chunk.type === `tool-output-available`) {
      return { ...chunk, output: replaceOutput((chunk as { output: unknown }).output) };
    }

    return chunk;
  };
}
