import type { InferUIMessageChunk, UIMessage } from "ai";

export type InferUIMessagePart<UI_MESSAGE extends UIMessage> = UI_MESSAGE["parts"][number];

export type InferUIMessagePartType<UI_MESSAGE extends UIMessage> =
  InferUIMessagePart<UI_MESSAGE>["type"];

export type InferUIMessageChunkType<UI_MESSAGE extends UIMessage> =
  InferUIMessageChunk<UI_MESSAGE>["type"];

/**
 * Extracts chunk type strings that match the prefix exactly or as `${PREFIX}-*`.
 * Dynamically derives chunk types from the actual UIMessageChunk union.
 *
 * @example
 * ```typescript
 * type TextChunks = ExtractChunkTypesByPrefix<MyUIMessage, 'text'>;
 * // => 'text-start' | 'text-delta' | 'text-end'
 *
 * type FileChunks = ExtractChunkTypesByPrefix<MyUIMessage, 'file'>;
 * // => 'file' (exact match)
 * ```
 */
type ExtractChunkTypesByPrefix<UI_MESSAGE extends UIMessage, PREFIX extends string> =
  InferUIMessageChunk<UI_MESSAGE> extends infer CHUNK
    ? CHUNK extends { type: infer T extends string }
      ? T extends PREFIX | `${PREFIX}-${string}`
        ? T
        : never
      : never
    : never;

/**
 * Maps a part type string to its corresponding chunk type(s).
 * Dynamically extracts from UIMessageChunk.
 *
 * Special handling:
 * - `tool-{NAME}` parts map to all `tool-*` chunk types (tool-input-start, tool-output-available, etc.)
 * - `dynamic-tool` parts also map to all `tool-*` chunk types
 * - `step-start` part maps to `start-step` chunk (naming inconsistency in AI SDK)
 *
 * @example
 * ```typescript
 * type TextChunkTypes = PartTypeToChunkTypes<MyUIMessage, 'text'>;
 * // => 'text-start' | 'text-delta' | 'text-end'
 *
 * type ToolChunkTypes = PartTypeToChunkTypes<MyUIMessage, 'tool-weather'>;
 * // => 'tool-input-start' | 'tool-input-delta' | ... (all tool chunk types)
 * ```
 */
export type PartTypeToChunkTypes<
  UI_MESSAGE extends UIMessage,
  PART_TYPE extends string,
> = PART_TYPE extends `tool-${string}` | "dynamic-tool"
  ? ExtractChunkTypesByPrefix<UI_MESSAGE, "tool">
  : PART_TYPE extends "step-start"
    ? "start-step"
    : ExtractChunkTypesByPrefix<UI_MESSAGE, PART_TYPE>;

/**
 * Extracts the chunk type(s) for a given part or part union.
 *
 * @example
 * ```typescript
 * type TextChunk = ExtractChunkForPart<MyUIMessage, TextPart>;
 * // => { type: 'text-start'; ... } | { type: 'text-delta'; ... } | { type: 'text-end'; ... }
 * ```
 */
export type ExtractChunkForPart<
  UI_MESSAGE extends UIMessage,
  PART extends InferUIMessagePart<UI_MESSAGE>,
> = Extract<
  InferUIMessageChunk<UI_MESSAGE>,
  { type: PartTypeToChunkTypes<UI_MESSAGE, PART["type"]> }
>;

/**
 * Extract a specific part type from UIMessage
 */
export type ExtractPart<UI_MESSAGE extends UIMessage, PART_TYPE extends string> = Extract<
  InferUIMessagePart<UI_MESSAGE>,
  { type: PART_TYPE }
>;

/**
 * Extract a specific chunk type from UIMessage
 */
export type ExtractChunk<UI_MESSAGE extends UIMessage, CHUNK_TYPE extends string> = Extract<
  InferUIMessageChunk<UI_MESSAGE>,
  { type: CHUNK_TYPE }
>;

/**
 * Exclude specific part types from UIMessage, returns the remaining part types
 */
export type ExcludePart<UI_MESSAGE extends UIMessage, PART_TYPE extends string> = Exclude<
  InferUIMessagePart<UI_MESSAGE>,
  { type: PART_TYPE }
>;

/**
 * Get the type string of excluded parts (the remaining part types)
 */
export type ExcludePartType<UI_MESSAGE extends UIMessage, PART_TYPE extends string> = ExcludePart<
  UI_MESSAGE,
  PART_TYPE
>["type"];

/**
 * Maps chunk type string(s) back to the corresponding part type string(s).
 * Reverse of `PartTypeToChunkTypes`.
 *
 * @example
 * ```typescript
 * type TextPartType = ChunkTypeToPartType<MyUIMessage, 'text-delta'>;
 * // => 'text'
 *
 * type ToolPartType = ChunkTypeToPartType<MyUIMessage, 'tool-input-delta'>;
 * // => 'tool-weather' | 'dynamic-tool' (all tool part types)
 * ```
 */
export type ChunkTypeToPartType<UI_MESSAGE extends UIMessage, CHUNK_TYPE extends string> =
  InferUIMessagePart<UI_MESSAGE> extends infer PART
    ? PART extends { type: infer PT extends string }
      ? CHUNK_TYPE extends PartTypeToChunkTypes<UI_MESSAGE, PT>
        ? PT
        : never
      : never
    : never;

/**
 * Extracts content chunk types (chunks that have a corresponding part type).
 * Excludes meta chunks like 'start', 'finish', etc.
 */
export type ContentChunkType<UI_MESSAGE extends UIMessage> = {
  [CT in InferUIMessageChunkType<UI_MESSAGE>]: [ChunkTypeToPartType<UI_MESSAGE, CT>] extends [never]
    ? never
    : CT;
}[InferUIMessageChunkType<UI_MESSAGE>];

/**
 * Distributing helper to collect all part types for chunk types.
 * Distributes over union chunk types to get all corresponding part types.
 */
type CollectPartTypesForChunk<
  UI_MESSAGE extends UIMessage,
  CHUNK_TYPE extends string,
> = CHUNK_TYPE extends string ? ChunkTypeToPartType<UI_MESSAGE, CHUNK_TYPE> : never;

/**
 * Detects if any chunk type in the union is a meta chunk (has no corresponding part type).
 * Returns `true` for meta chunks, `never` otherwise.
 */
type HasMetaChunk<
  UI_MESSAGE extends UIMessage,
  CHUNK_TYPE extends string,
> = CHUNK_TYPE extends string
  ? [ChunkTypeToPartType<UI_MESSAGE, CHUNK_TYPE>] extends [never]
    ? true
    : never
  : never;

/**
 * Infer part type from chunk type for .on() callback.
 * Returns { type: PART_TYPE } for content chunks, undefined for meta chunks.
 * For union chunk types, returns union of their part types.
 * When mixing content and meta chunks, includes undefined in the union.
 *
 * @example
 * ```typescript
 * // Content chunk: part is { type: 'text' }
 * type TextPart = InferPartForChunk<MyUIMessage, 'text-delta'>;
 * // => { type: 'text' }
 *
 * // Meta chunk: part is undefined
 * type MetaPart = InferPartForChunk<MyUIMessage, 'start'>;
 * // => undefined
 *
 * // Union of content chunks: part type is union
 * type UnionPart = InferPartForChunk<MyUIMessage, 'text-delta' | 'reasoning-delta'>;
 * // => { type: 'text' | 'reasoning' }
 *
 * // Mixed content and meta chunks: includes undefined
 * type MixedPart = InferPartForChunk<MyUIMessage, 'text-delta' | 'start'>;
 * // => { type: 'text' } | undefined
 * ```
 */
export type InferPartForChunk<UI_MESSAGE extends UIMessage, CHUNK_TYPE extends string> = [
  CollectPartTypesForChunk<UI_MESSAGE, CHUNK_TYPE>,
] extends [never]
  ? undefined
  : [HasMetaChunk<UI_MESSAGE, CHUNK_TYPE>] extends [never]
    ? { type: CollectPartTypesForChunk<UI_MESSAGE, CHUNK_TYPE> }
    : { type: CollectPartTypesForChunk<UI_MESSAGE, CHUNK_TYPE> } | undefined;
