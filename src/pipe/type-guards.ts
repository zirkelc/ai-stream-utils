import type { InferUIMessageChunk, UIMessage } from "ai";
import type {
  ChunkTypeToPartType,
  ContentChunkType,
  ExcludePartForChunks,
  ExcludeToolChunkTypes,
  ExcludeToolPartTypes,
  ExtractChunk,
  ExtractChunkForPart,
  ExtractPart,
  InferPartForChunk,
  InferToolName,
  InferUIMessageChunkType,
  InferUIMessagePartType,
  PartTypeToChunkTypes,
} from "../types.js";
import type { FilterGuard, ObserveGuard } from "./types.js";

/**
 * Creates a filter guard that includes specific content chunk types.
 * Use with `.filter()` to narrow to specific chunks.
 *
 * @example
 * ```typescript
 * pipe<MyUIMessage>(stream)
 *   .filter(includeChunks('text-delta'))
 *   .map(({ chunk }) => chunk); // chunk is narrowed to text-delta chunk
 *
 * pipe<MyUIMessage>(stream)
 *   .filter(includeChunks(['text-delta', 'text-end']))
 *   .map(({ chunk }) => chunk); // chunk is narrowed to text-delta | text-end
 * ```
 */
export function includeChunks<
  UI_MESSAGE extends UIMessage,
  CHUNK_TYPE extends ContentChunkType<UI_MESSAGE>,
>(
  types: CHUNK_TYPE | Array<CHUNK_TYPE>,
): FilterGuard<
  UI_MESSAGE,
  ExtractChunk<UI_MESSAGE, CHUNK_TYPE>,
  { type: ChunkTypeToPartType<UI_MESSAGE, CHUNK_TYPE> }
> {
  const typeArray = Array.isArray(types) ? types : [types];

  const guard = <
    T extends {
      chunk: InferUIMessageChunk<UI_MESSAGE>;
      part?: { type: string } | undefined;
    },
  >(
    input: T,
  ): input is T & {
    chunk: ExtractChunk<UI_MESSAGE, CHUNK_TYPE>;
    part: { type: ChunkTypeToPartType<UI_MESSAGE, CHUNK_TYPE> };
  } => (typeArray as Array<string>).includes((input.chunk as { type: string }).type);

  return guard as FilterGuard<
    UI_MESSAGE,
    ExtractChunk<UI_MESSAGE, CHUNK_TYPE>,
    { type: ChunkTypeToPartType<UI_MESSAGE, CHUNK_TYPE> }
  >;
}

/**
 * Creates a filter guard that includes specific part types.
 * Use with `.filter()` to narrow to chunks belonging to specific parts.
 *
 * @example
 * ```typescript
 * pipe<MyUIMessage>(stream)
 *   .filter(includeParts('text'))
 *   .map(({ chunk, part }) => chunk); // chunk is narrowed to text chunks
 *
 * pipe<MyUIMessage>(stream)
 *   .filter(includeParts(['text', 'reasoning']))
 *   .map(({ chunk }) => chunk); // chunk is text or reasoning chunks
 * ```
 */
export function includeParts<
  UI_MESSAGE extends UIMessage,
  PART_TYPE extends InferUIMessagePartType<UI_MESSAGE>,
>(
  types: PART_TYPE | Array<PART_TYPE>,
): FilterGuard<
  UI_MESSAGE,
  ExtractChunkForPart<UI_MESSAGE, ExtractPart<UI_MESSAGE, PART_TYPE>>,
  { type: PART_TYPE }
> {
  const typeArray = Array.isArray(types) ? types : [types];

  const guard = <
    T extends {
      chunk: InferUIMessageChunk<UI_MESSAGE>;
      part?: { type: string } | undefined;
    },
  >(
    input: T,
  ): input is T & {
    chunk: ExtractChunkForPart<UI_MESSAGE, ExtractPart<UI_MESSAGE, PART_TYPE>>;
    part: { type: PART_TYPE };
  } => (typeArray as Array<string>).includes((input.part as { type: string })?.type);

  return guard as FilterGuard<
    UI_MESSAGE,
    ExtractChunkForPart<UI_MESSAGE, ExtractPart<UI_MESSAGE, PART_TYPE>>,
    { type: PART_TYPE }
  >;
}

/**
 * Creates a filter guard that excludes specific content chunk types.
 * Use with `.filter()` to keep all chunks except the specified types.
 *
 * @example
 * ```typescript
 * pipe<MyUIMessage>(stream)
 *   .filter(excludeChunks('text-delta'))
 *   .map(({ chunk }) => chunk); // chunk is all content chunks except text-delta
 *
 * pipe<MyUIMessage>(stream)
 *   .filter(excludeChunks(['text-start', 'text-end']))
 *   .map(({ chunk }) => chunk); // excludes text-start and text-end
 * ```
 */
export function excludeChunks<
  UI_MESSAGE extends UIMessage,
  CHUNK_TYPE extends ContentChunkType<UI_MESSAGE>,
>(
  types: CHUNK_TYPE | Array<CHUNK_TYPE>,
): FilterGuard<
  UI_MESSAGE,
  ExtractChunk<UI_MESSAGE, Exclude<ContentChunkType<UI_MESSAGE>, CHUNK_TYPE>>,
  { type: ExcludePartForChunks<UI_MESSAGE, CHUNK_TYPE> }
> {
  const typeArray = Array.isArray(types) ? types : [types];

  const guard = <
    T extends {
      chunk: InferUIMessageChunk<UI_MESSAGE>;
      part?: { type: string } | undefined;
    },
  >(
    input: T,
  ): input is T & {
    chunk: ExtractChunk<UI_MESSAGE, Exclude<ContentChunkType<UI_MESSAGE>, CHUNK_TYPE>>;
    part: { type: ExcludePartForChunks<UI_MESSAGE, CHUNK_TYPE> };
  } => !(typeArray as Array<string>).includes((input.chunk as { type: string }).type);

  return guard as FilterGuard<
    UI_MESSAGE,
    ExtractChunk<UI_MESSAGE, Exclude<ContentChunkType<UI_MESSAGE>, CHUNK_TYPE>>,
    { type: ExcludePartForChunks<UI_MESSAGE, CHUNK_TYPE> }
  >;
}

/**
 * Creates a filter guard that excludes specific part types.
 * Use with `.filter()` to keep all chunks except those belonging to specified parts.
 *
 * @example
 * ```typescript
 * pipe<MyUIMessage>(stream)
 *   .filter(excludeParts('text'))
 *   .map(({ chunk }) => chunk); // excludes all text chunks
 *
 * pipe<MyUIMessage>(stream)
 *   .filter(excludeParts(['text', 'reasoning']))
 *   .map(({ chunk }) => chunk); // excludes text and reasoning chunks
 * ```
 */
export function excludeParts<
  UI_MESSAGE extends UIMessage,
  PART_TYPE extends InferUIMessagePartType<UI_MESSAGE>,
>(
  types: PART_TYPE | Array<PART_TYPE>,
): FilterGuard<
  UI_MESSAGE,
  ExtractChunk<
    UI_MESSAGE,
    Exclude<ContentChunkType<UI_MESSAGE>, PartTypeToChunkTypes<UI_MESSAGE, PART_TYPE>>
  >,
  { type: Exclude<InferUIMessagePartType<UI_MESSAGE>, PART_TYPE> }
> {
  const typeArray = Array.isArray(types) ? types : [types];

  const guard = <
    T extends {
      chunk: InferUIMessageChunk<UI_MESSAGE>;
      part?: { type: string } | undefined;
    },
  >(
    input: T,
  ): input is T & {
    chunk: ExtractChunk<
      UI_MESSAGE,
      Exclude<ContentChunkType<UI_MESSAGE>, PartTypeToChunkTypes<UI_MESSAGE, PART_TYPE>>
    >;
    part: { type: Exclude<InferUIMessagePartType<UI_MESSAGE>, PART_TYPE> };
  } => !(typeArray as Array<string>).includes((input.part as { type: string })?.type);

  return guard as FilterGuard<
    UI_MESSAGE,
    ExtractChunk<
      UI_MESSAGE,
      Exclude<ContentChunkType<UI_MESSAGE>, PartTypeToChunkTypes<UI_MESSAGE, PART_TYPE>>
    >,
    { type: Exclude<InferUIMessagePartType<UI_MESSAGE>, PART_TYPE> }
  >;
}

/**
 * Creates an observe guard that matches specific chunk types, including meta chunks.
 * Use with `.on()` to observe specific chunks without filtering.
 *
 * @example
 * ```typescript
 * // Observe content chunks
 * pipe<MyUIMessage>(stream)
 *   .on(chunkType('text-delta'), ({ chunk, part }) => {
 *     // chunk is text-delta, part is { type: 'text' }
 *   });
 *
 * // Observe meta chunks
 * pipe<MyUIMessage>(stream)
 *   .on(chunkType('start'), ({ chunk, part }) => {
 *     // chunk is start chunk, part is undefined
 *   });
 *
 * // Observe multiple chunk types
 * pipe<MyUIMessage>(stream)
 *   .on(chunkType(['text-delta', 'start']), ({ chunk, part }) => {
 *     // chunk is text-delta | start, part is { type: 'text' } | undefined
 *   });
 * ```
 */
export function chunkType<
  UI_MESSAGE extends UIMessage,
  CHUNK_TYPE extends InferUIMessageChunkType<UI_MESSAGE>,
>(
  types: CHUNK_TYPE | Array<CHUNK_TYPE>,
): ObserveGuard<
  UI_MESSAGE,
  ExtractChunk<UI_MESSAGE, CHUNK_TYPE>,
  InferPartForChunk<UI_MESSAGE, CHUNK_TYPE>
> {
  const typeArray = Array.isArray(types) ? types : [types];

  const guard = <
    T extends {
      chunk: InferUIMessageChunk<UI_MESSAGE>;
      part?: { type: string } | undefined;
    },
  >(
    input: T,
  ): input is T & {
    chunk: ExtractChunk<UI_MESSAGE, CHUNK_TYPE>;
    part: InferPartForChunk<UI_MESSAGE, CHUNK_TYPE>;
  } => (typeArray as Array<string>).includes((input.chunk as { type: string }).type);

  return guard as ObserveGuard<
    UI_MESSAGE,
    ExtractChunk<UI_MESSAGE, CHUNK_TYPE>,
    InferPartForChunk<UI_MESSAGE, CHUNK_TYPE>
  >;
}

/**
 * Creates an observe guard that matches specific part types.
 * Use with `.on()` to observe chunks belonging to specific parts without filtering.
 *
 * @example
 * ```typescript
 * // Observe text parts
 * pipe<MyUIMessage>(stream)
 *   .on(partType('text'), ({ chunk, part }) => {
 *     // chunk is text chunk, part is { type: 'text' }
 *   });
 *
 * // Observe multiple part types
 * pipe<MyUIMessage>(stream)
 *   .on(partType(['text', 'reasoning']), ({ chunk, part }) => {
 *     // chunk is text | reasoning chunk, part is { type: 'text' | 'reasoning' }
 *   });
 * ```
 */
export function partType<
  UI_MESSAGE extends UIMessage,
  PART_TYPE extends InferUIMessagePartType<UI_MESSAGE>,
>(
  types: PART_TYPE | Array<PART_TYPE>,
): ObserveGuard<
  UI_MESSAGE,
  ExtractChunkForPart<UI_MESSAGE, ExtractPart<UI_MESSAGE, PART_TYPE>>,
  { type: PART_TYPE }
> {
  const typeArray = Array.isArray(types) ? types : [types];

  const guard = <
    T extends {
      chunk: InferUIMessageChunk<UI_MESSAGE>;
      part?: { type: string } | undefined;
    },
  >(
    input: T,
  ): input is T & {
    chunk: ExtractChunkForPart<UI_MESSAGE, ExtractPart<UI_MESSAGE, PART_TYPE>>;
    part: { type: PART_TYPE };
  } => (typeArray as Array<string>).includes((input.part as { type: string })?.type);

  return guard as ObserveGuard<
    UI_MESSAGE,
    ExtractChunkForPart<UI_MESSAGE, ExtractPart<UI_MESSAGE, PART_TYPE>>,
    { type: PART_TYPE }
  >;
}

/**
 * Creates a filter guard that includes only specific tools while keeping non-tool chunks.
 * Use with `.filter()` to include only specific tools.
 *
 * @example
 * ```typescript
 * // No-op: all chunks pass through
 * pipe<MyUIMessage>(stream)
 *   .filter(includeTools())
 *   .map(({ chunk }) => chunk); // all chunks pass
 *
 * // Include specific tool (non-tool chunks still pass)
 * pipe<MyUIMessage>(stream)
 *   .filter(includeTools('weather'))
 *   .map(({ chunk }) => chunk); // text + tool-weather chunks
 *
 * // Include multiple tools
 * pipe<MyUIMessage>(stream)
 *   .filter(includeTools(['weather', 'calculator']))
 *   .map(({ chunk }) => chunk); // text + specified tool chunks
 * ```
 */
export function includeTools<UI_MESSAGE extends UIMessage>(): FilterGuard<
  UI_MESSAGE,
  InferUIMessageChunk<UI_MESSAGE>,
  { type: InferUIMessagePartType<UI_MESSAGE> }
>;
export function includeTools<
  UI_MESSAGE extends UIMessage,
  TOOL_NAME extends InferToolName<UI_MESSAGE>,
>(
  toolNames: TOOL_NAME | Array<TOOL_NAME>,
): FilterGuard<
  UI_MESSAGE,
  InferUIMessageChunk<UI_MESSAGE>,
  { type: ExcludeToolPartTypes<UI_MESSAGE> | `tool-${TOOL_NAME}` }
>;
export function includeTools<UI_MESSAGE extends UIMessage>(
  toolNames?: string | Array<string>,
): FilterGuard<UI_MESSAGE, InferUIMessageChunk<UI_MESSAGE>, { type: string }> {
  const toolNameArray =
    toolNames === undefined ? undefined : Array.isArray(toolNames) ? toolNames : [toolNames];

  const guard = <T extends { chunk: { type: string }; part?: { type: string } | undefined }>(
    input: T,
  ): boolean => {
    /** No args = no-op, all chunks pass */
    if (toolNameArray === undefined) return true;

    const partType = input.part?.type;
    if (!partType) return true;

    /** Non-tool chunks pass */
    if (!partType.startsWith(`tool-`) && partType !== `dynamic-tool`) {
      return true;
    }

    /** Only matching tool chunks pass */
    for (const name of toolNameArray) {
      if (partType === `tool-${name}`) return true;
    }
    return false;
  };

  return guard as FilterGuard<UI_MESSAGE, InferUIMessageChunk<UI_MESSAGE>, { type: string }>;
}

/**
 * Creates a filter guard that excludes all or only specific tools while keeping non-tool chunks.
 * Use with `.filter()` to exclude specific tools or all tools.
 *
 * @example
 * ```typescript
 * // Exclude all tools
 * pipe<MyUIMessage>(stream)
 *   .filter(excludeTools())
 *   .map(({ chunk }) => chunk); // no tool chunks
 *
 * // Exclude specific tool
 * pipe<MyUIMessage>(stream)
 *   .filter(excludeTools('weather'))
 *   .map(({ chunk }) => chunk); // excludes tool-weather chunks
 *
 * // Exclude multiple tools
 * pipe<MyUIMessage>(stream)
 *   .filter(excludeTools(['weather', 'calculator']))
 *   .map(({ chunk }) => chunk); // excludes weather and calculator
 * ```
 */
export function excludeTools<UI_MESSAGE extends UIMessage>(): FilterGuard<
  UI_MESSAGE,
  ExtractChunk<UI_MESSAGE, ExcludeToolChunkTypes<UI_MESSAGE>>,
  { type: ExcludeToolPartTypes<UI_MESSAGE> }
>;
export function excludeTools<
  UI_MESSAGE extends UIMessage,
  TOOL_NAME extends InferToolName<UI_MESSAGE>,
>(
  toolNames: TOOL_NAME | Array<TOOL_NAME>,
): FilterGuard<
  UI_MESSAGE,
  InferUIMessageChunk<UI_MESSAGE>,
  { type: Exclude<InferUIMessagePartType<UI_MESSAGE>, `tool-${TOOL_NAME}`> }
>;
export function excludeTools<UI_MESSAGE extends UIMessage>(
  toolNames?: string | Array<string>,
): FilterGuard<UI_MESSAGE, InferUIMessageChunk<UI_MESSAGE>, { type: string }> {
  const toolNameArray =
    toolNames === undefined ? undefined : Array.isArray(toolNames) ? toolNames : [toolNames];

  const guard = <T extends { chunk: { type: string }; part?: { type: string } | undefined }>(
    input: T,
  ): boolean => {
    const partType = input.part?.type;
    /** Meta chunks pass (no part type) */
    if (!partType) return true;

    /** No args = exclude all tool chunks */
    if (toolNameArray === undefined) {
      return !partType.startsWith(`tool-`) && partType !== `dynamic-tool`;
    }

    /** Exclude only matching tool chunks */
    for (const name of toolNameArray) {
      if (partType === `tool-${name}`) return false;
    }
    return true;
  };

  return guard as FilterGuard<UI_MESSAGE, InferUIMessageChunk<UI_MESSAGE>, { type: string }>;
}
