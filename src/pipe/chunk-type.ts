import type { InferUIMessageChunk, UIMessage } from "ai";

/**
 * Type guard predicate for chunk types.
 * Used with `.filter()` to narrow chunk types.
 * Generic T allows the guard to preserve other properties (like `part`) from the input.
 * The __brand property is used to distinguish from plain predicates (never actually exists at runtime).
 */
export type ChunkTypeGuard<UI_MESSAGE extends UIMessage, CHUNK_TYPE extends string> = {
  <T extends { chunk: InferUIMessageChunk<UI_MESSAGE> }>(
    input: T,
  ): input is T & {
    chunk: Extract<InferUIMessageChunk<UI_MESSAGE>, { type: CHUNK_TYPE }>;
  };
  /** @internal Type brand - never exists at runtime */
  readonly __brand: `ChunkTypeGuard`;
};

/**
 * Creates a type guard that narrows by chunk type.
 * Use with `.filter()`.
 *
 * @example
 * ```typescript
 * pipe<MyUIMessage>(stream)
 *   .filter(isChunkType('text-delta'))
 *   .map(({ chunk }) => chunk); // chunk is narrowed to text-delta chunk
 *
 * pipe<MyUIMessage>(stream)
 *   .filter(isChunkType(['text-delta', 'text-end']))
 *   .map(({ chunk }) => chunk); // chunk is narrowed to text-delta | text-end chunk
 * ```
 */
export function isChunkType<UI_MESSAGE extends UIMessage, CHUNK_TYPE extends string>(
  types: CHUNK_TYPE | Array<CHUNK_TYPE>,
): ChunkTypeGuard<UI_MESSAGE, CHUNK_TYPE> {
  const typeArray = Array.isArray(types) ? types : [types];

  const guard = <T extends { chunk: InferUIMessageChunk<UI_MESSAGE> }>(
    input: T,
  ): input is T & {
    chunk: Extract<InferUIMessageChunk<UI_MESSAGE>, { type: CHUNK_TYPE }>;
  } => (typeArray as Array<string>).includes((input.chunk as { type: string }).type);

  return guard as ChunkTypeGuard<UI_MESSAGE, CHUNK_TYPE>;
}
