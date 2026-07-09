import type { AsyncIterableStream, ProviderMetadata } from "ai";
import { describe, expectTypeOf, it } from "vitest";
import type {
  FileChunk,
  MyUIMessage,
  MyUIMessageChunk,
  SourceUrlChunk,
  TextDeltaChunk,
  TextEndChunk,
  TextStartChunk,
  ToolChunk,
} from "../test/ui-message.js";
import {
  transformProviderMetadata,
  type ProviderMetadataChunk,
  type ProviderMetadataChunkType,
} from "./transform-provider-metadata.js";
import { pipe } from "./pipe.js";

const mockStream = null as unknown as ReadableStream<MyUIMessageChunk>;

describe(`transformProviderMetadata types`, () => {
  describe(`ProviderMetadataChunk`, () => {
    it(`should select only chunks that carry providerMetadata`, () => {
      type ToolWithMeta = Extract<ToolChunk, { type: `tool-input-available` }>;
      type ToolWithoutMeta = Extract<ToolChunk, { type: `tool-output-denied` }>;

      expectTypeOf<TextStartChunk>().toExtend<ProviderMetadataChunk<MyUIMessage>>();
      expectTypeOf<TextDeltaChunk>().toExtend<ProviderMetadataChunk<MyUIMessage>>();
      expectTypeOf<TextEndChunk>().toExtend<ProviderMetadataChunk<MyUIMessage>>();
      expectTypeOf<SourceUrlChunk>().toExtend<ProviderMetadataChunk<MyUIMessage>>();
      expectTypeOf<FileChunk>().toExtend<ProviderMetadataChunk<MyUIMessage>>();
      expectTypeOf<ToolWithMeta>().toExtend<ProviderMetadataChunk<MyUIMessage>>();

      expectTypeOf<ToolWithoutMeta>().not.toExtend<ProviderMetadataChunk<MyUIMessage>>();
    });

    it(`should expose exactly the metadata-bearing chunk types`, () => {
      expectTypeOf<ProviderMetadataChunkType>().toEqualTypeOf<
        | `text-start`
        | `text-delta`
        | `text-end`
        | `reasoning-start`
        | `reasoning-delta`
        | `reasoning-end`
        | `reasoning-file`
        | `tool-input-start`
        | `tool-input-available`
        | `tool-input-error`
        | `tool-approval-response`
        | `tool-output-available`
        | `tool-output-error`
        | `source-url`
        | `source-document`
        | `file`
        | `custom`
      >();
    });
  });

  describe(`transformProviderMetadata`, () => {
    it(`should infer the message type and narrow the callback chunk`, () => {
      pipe<MyUIMessage>(mockStream).map(
        transformProviderMetadata(({ chunk, metadata, part }) => {
          expectTypeOf(chunk).toEqualTypeOf<ProviderMetadataChunk<MyUIMessage>>();
          expectTypeOf(metadata).toEqualTypeOf<ProviderMetadata | undefined>();
          expectTypeOf(part).toEqualTypeOf<{ type: string }>();
          return { ...metadata, app: { id: `1` } };
        }),
      );
    });

    it(`should allow returning undefined to leave metadata unchanged`, () => {
      pipe<MyUIMessage>(mockStream)
        .map(transformProviderMetadata(() => undefined))
        .toStream();
    });

    it(`should allow returning null to remove metadata`, () => {
      pipe<MyUIMessage>(mockStream)
        .map(transformProviderMetadata(() => null))
        .toStream();
    });

    it(`should preserve the pipeline output type`, () => {
      const result = pipe<MyUIMessage>(mockStream)
        .map(transformProviderMetadata(({ metadata }) => metadata))
        .toStream();
      expectTypeOf(result).toEqualTypeOf<AsyncIterableStream<MyUIMessageChunk>>();
    });

    it(`should reject a non-ProviderMetadata return`, () => {
      pipe<MyUIMessage>(mockStream).map(
        // @ts-expect-error string is not assignable to ProviderMetadata | undefined
        transformProviderMetadata(() => `not metadata`),
      );
    });
  });
});
