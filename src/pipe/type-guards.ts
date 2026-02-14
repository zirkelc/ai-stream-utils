import type { InferUIMessageChunk, UIMessage } from "ai";
import type {
  ExtractChunk,
  ExtractPart,
  InferUIMessageChunkType,
  InferUIMessagePart,
  InferUIMessagePartType,
} from "../types.js";
import type { ChunkTypeGuard, PartTypeGuard } from "./types.js";

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
export function isChunkType<
  UI_MESSAGE extends UIMessage,
  CHUNK_TYPE extends InferUIMessageChunkType<UI_MESSAGE>,
>(types: CHUNK_TYPE | Array<CHUNK_TYPE>): ChunkTypeGuard<UI_MESSAGE, CHUNK_TYPE> {
  const typeArray = Array.isArray(types) ? types : [types];

  const guard = <T extends { chunk: InferUIMessageChunk<UI_MESSAGE> }>(
    input: T,
  ): input is T & {
    chunk: ExtractChunk<UI_MESSAGE, CHUNK_TYPE>;
  } => (typeArray as Array<string>).includes((input.chunk as { type: string }).type);

  return guard as ChunkTypeGuard<UI_MESSAGE, CHUNK_TYPE>;
}

/**
 * Creates a type guard that narrows by part type.
 * Use with `.filter()` and `.match()`.
 *
 * @example
 * ```typescript
 * // Filter by part type
 * pipe<MyUIMessage>(stream)
 *   .filter(isPartType(['text', 'reasoning']))
 *   .map(({ chunk, part }) => chunk);
 *
 * // Match specific part types
 * pipe<MyUIMessage>(stream)
 *   .match(isPartType('text'), (pipe) =>
 *     pipe.map(({ chunk }) => chunk)
 *   );
 * ```
 */
export function isPartType<
  UI_MESSAGE extends UIMessage,
  PART_TYPE extends InferUIMessagePartType<UI_MESSAGE>,
>(types: PART_TYPE | Array<PART_TYPE>): PartTypeGuard<UI_MESSAGE, PART_TYPE> {
  const typeArray = Array.isArray(types) ? types : [types];

  const guard = <T extends { part: InferUIMessagePart<UI_MESSAGE> }>(
    input: T,
  ): input is T & { part: ExtractPart<UI_MESSAGE, PART_TYPE> } =>
    (typeArray as Array<string>).includes((input.part as { type: string }).type);

  return guard as PartTypeGuard<UI_MESSAGE, PART_TYPE>;
}
