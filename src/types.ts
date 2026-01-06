import type { InferUIMessageChunk, UIMessage } from 'ai';

export type InferUIMessagePart<UI_MESSAGE extends UIMessage> =
  UI_MESSAGE['parts'][number];

export type InferUIMessagePartType<UI_MESSAGE extends UIMessage> =
  InferUIMessagePart<UI_MESSAGE>['type'];

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
type ExtractChunkTypesByPrefix<
  UI_MESSAGE extends UIMessage,
  PREFIX extends string,
> = InferUIMessageChunk<UI_MESSAGE> extends infer CHUNK
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
> = PART_TYPE extends `tool-${string}` | 'dynamic-tool'
  ? ExtractChunkTypesByPrefix<UI_MESSAGE, 'tool'>
  : PART_TYPE extends 'step-start'
    ? 'start-step'
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
  { type: PartTypeToChunkTypes<UI_MESSAGE, PART['type']> }
>;

/**
 * Extract a specific part type from UIMessage
 */
export type ExtractPart<
  UI_MESSAGE extends UIMessage,
  PART_TYPE extends InferUIMessagePartType<UI_MESSAGE>,
> = Extract<InferUIMessagePart<UI_MESSAGE>, { type: PART_TYPE }>;

/**
 * Exclude specific part types from UIMessage, returns the remaining part types
 */
export type ExcludePart<
  UI_MESSAGE extends UIMessage,
  PART_TYPE extends InferUIMessagePartType<UI_MESSAGE>,
> = Exclude<InferUIMessagePart<UI_MESSAGE>, { type: PART_TYPE }>;

/**
 * Get the type string of excluded parts (the remaining part types)
 */
export type ExcludePartType<
  UI_MESSAGE extends UIMessage,
  PART_TYPE extends InferUIMessagePartType<UI_MESSAGE>,
> = ExcludePart<UI_MESSAGE, PART_TYPE>['type'];
