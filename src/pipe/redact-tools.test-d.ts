import type { AsyncIterableStream } from "ai";
import { describe, expectTypeOf, it } from "vitest";
import type { MyUIMessage, MyUIMessageChunk } from "../test/ui-message.js";
import { pipe } from "./pipe.js";
import { redactTools } from "./redact-tools.js";
import { includeParts } from "./type-guards.js";

const mockStream = null as unknown as ReadableStream<MyUIMessageChunk>;

describe(`redactTools types`, () => {
  it(`should accept no arguments`, () => {
    pipe<MyUIMessage>(mockStream).map(redactTools());
  });

  it(`should accept known tool names`, () => {
    pipe<MyUIMessage>(mockStream)
      .map(redactTools(`weather`))
      .map(redactTools([`weather`]));
  });

  it(`should accept options with or without tool names`, () => {
    pipe<MyUIMessage>(mockStream)
      .map(redactTools({ output: false }))
      .map(redactTools(`weather`, { input: false }))
      .map(redactTools([`weather`], { input: true, output: false }));
  });

  it(`should reject unknown tool names`, () => {
    // @ts-expect-error unknown is not a tool of MyUIMessage
    pipe<MyUIMessage>(mockStream).map(redactTools(`unknown`));
    // @ts-expect-error unknown is not a tool of MyUIMessage
    pipe<MyUIMessage>(mockStream).map(redactTools([`unknown`], { output: false }));
  });

  it(`should accept replacer functions`, () => {
    pipe<MyUIMessage>(mockStream)
      .map(
        redactTools({
          input: (input) => {
            expectTypeOf(input).toEqualTypeOf<unknown>();
            return {};
          },
          output: (output) => {
            expectTypeOf(output).toEqualTypeOf<unknown>();
            return `redacted`;
          },
        }),
      )
      .map(redactTools(`weather`, { output: () => ({}) }));
  });

  it(`should reject a value that is not a boolean or a function`, () => {
    // @ts-expect-error a replacement value must be returned from a function
    pipe<MyUIMessage>(mockStream).map(redactTools({ output: {} }));
  });

  it(`should reject unknown options`, () => {
    // @ts-expect-error tools is not an option, tool names are the first argument
    pipe<MyUIMessage>(mockStream).map(redactTools({ tools: [`weather`] }));
  });

  it(`should work after a narrowing filter`, () => {
    pipe<MyUIMessage>(mockStream)
      .filter(includeParts([`text`, `tool-weather`]))
      .map(redactTools());
  });

  it(`should preserve the pipeline output type`, () => {
    const result = pipe<MyUIMessage>(mockStream).map(redactTools()).toStream();
    expectTypeOf(result).toEqualTypeOf<AsyncIterableStream<MyUIMessageChunk>>();
  });
});
