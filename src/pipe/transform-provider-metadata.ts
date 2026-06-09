import type { InferUIMessageChunk, ProviderMetadata, UIMessage } from "ai";
import type { ChunkMapFn } from "./types.js";

/**
 * A composable helper that plugs into the `.map()` operator to change provider
 * metadata on the chunks that carry it:
 *
 * @example
 * ```typescript
 * pipe<MyUIMessage>(stream)
 *   .map(transformProviderMetadata(({ metadata }) => ({ ...metadata, app: { id } })))
 *   .toStream();
 * ```
 */

/**
 * Chunk variants in UI_MESSAGE that actually carry a `providerMetadata` field.
 * Optional keys are still present in `keyof`, so this discriminates correctly:
 * variants without the field (error, tool-output-*, start, finish, ...) drop to never.
 */
export type ProviderMetadataChunk<UI_MESSAGE extends UIMessage> =
  InferUIMessageChunk<UI_MESSAGE> extends infer CHUNK
    ? CHUNK extends unknown
      ? "providerMetadata" extends keyof CHUNK
        ? CHUNK
        : never
      : never
    : never;

/** The `type` strings of every chunk variant that carries `providerMetadata`. */
export type ProviderMetadataChunkType = ProviderMetadataChunk<UIMessage>["type"];

/**
 * Runtime allow-list whose keys are pinned to `ProviderMetadataChunkType` by the
 * compiler. The AI SDK does not expose its zod chunk union for runtime
 * introspection (`uiMessageChunkSchema` is an async, non-introspectable `Schema`
 * wrapper), so completeness is enforced at the type level instead: if the SDK
 * adds or removes a metadata-bearing chunk, `ProviderMetadataChunkType` changes
 * and this literal stops compiling (missing key, or unknown key) until updated.
 */
const PROVIDER_METADATA_CHUNK_TYPES: Record<ProviderMetadataChunkType, true> = {
  "text-start": true,
  "text-delta": true,
  "text-end": true,
  "reasoning-start": true,
  "reasoning-delta": true,
  "reasoning-end": true,
  "tool-input-start": true,
  "tool-input-available": true,
  "tool-input-error": true,
  "source-url": true,
  "source-document": true,
  file: true,
};

/** Narrows any chunk to the metadata-bearing union via the pinned allow-list. */
export function isProviderMetadataChunk(chunk: {
  type: string;
}): chunk is ProviderMetadataChunk<UIMessage> {
  return Object.hasOwn(PROVIDER_METADATA_CHUNK_TYPES, chunk.type);
}

/**
 * Mapper invoked for every metadata-bearing chunk. Receives the chunk, its part
 * type, and the current `providerMetadata` (may be undefined). Return value:
 * - an object to set/replace `providerMetadata` (merge by spreading `metadata`)
 * - `undefined` to leave the chunk unchanged
 * - `null` to remove the `providerMetadata` field entirely
 *
 * `null` removes the field, not the chunk: the chunk always passes through.
 */
export type ProviderMetadataTransformFn<UI_MESSAGE extends UIMessage> = (input: {
  chunk: ProviderMetadataChunk<UI_MESSAGE>;
  part: { type: string };
  metadata: ProviderMetadata | undefined;
}) => ProviderMetadata | null | undefined;

/**
 * Creates a `.map()` callback that rewrites `providerMetadata` on metadata-bearing
 * chunks and passes every other chunk through unchanged.
 */
export function transformProviderMetadata<UI_MESSAGE extends UIMessage>(
  fn: ProviderMetadataTransformFn<UI_MESSAGE>,
): ChunkMapFn<UI_MESSAGE, InferUIMessageChunk<UI_MESSAGE>, { type: string }> {
  return ({ chunk, part }) => {
    if (!isProviderMetadataChunk(chunk)) return chunk;
    const metadata = (chunk as { providerMetadata?: ProviderMetadata }).providerMetadata;
    const next = fn({ chunk: chunk as ProviderMetadataChunk<UI_MESSAGE>, part, metadata });

    /** undefined leaves the chunk unchanged. */
    if (next === undefined) return chunk;

    /** null removes the field while keeping the chunk. */
    if (next === null) {
      const { providerMetadata: _omit, ...rest } = chunk as {
        providerMetadata?: ProviderMetadata;
      };
      return rest as InferUIMessageChunk<UI_MESSAGE>;
    }

    /** an object sets/replaces the field. */
    return { ...chunk, providerMetadata: next };
  };
}
