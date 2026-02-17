import type { InferUIMessageChunk, UIMessage } from "ai";
import type {
  ChunkTypeToPartType,
  ContentChunkType,
  ExcludePartForChunks,
  ExtractChunk,
  ExtractChunkForPart,
  ExtractPart,
  InferPartForChunk,
  InferUIMessageChunkType,
  InferUIMessagePartType,
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
  Exclude<
    ExtractChunk<UI_MESSAGE, ContentChunkType<UI_MESSAGE>>,
    ExtractChunk<UI_MESSAGE, CHUNK_TYPE>
  >,
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
    chunk: Exclude<
      ExtractChunk<UI_MESSAGE, ContentChunkType<UI_MESSAGE>>,
      ExtractChunk<UI_MESSAGE, CHUNK_TYPE>
    >;
    part: { type: ExcludePartForChunks<UI_MESSAGE, CHUNK_TYPE> };
  } => !(typeArray as Array<string>).includes((input.chunk as { type: string }).type);

  return guard as FilterGuard<
    UI_MESSAGE,
    Exclude<
      ExtractChunk<UI_MESSAGE, ContentChunkType<UI_MESSAGE>>,
      ExtractChunk<UI_MESSAGE, CHUNK_TYPE>
    >,
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
  Exclude<
    ExtractChunk<UI_MESSAGE, ContentChunkType<UI_MESSAGE>>,
    ExtractChunkForPart<UI_MESSAGE, ExtractPart<UI_MESSAGE, PART_TYPE>>
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
    chunk: Exclude<
      ExtractChunk<UI_MESSAGE, ContentChunkType<UI_MESSAGE>>,
      ExtractChunkForPart<UI_MESSAGE, ExtractPart<UI_MESSAGE, PART_TYPE>>
    >;
    part: { type: Exclude<InferUIMessagePartType<UI_MESSAGE>, PART_TYPE> };
  } => !(typeArray as Array<string>).includes((input.part as { type: string })?.type);

  return guard as FilterGuard<
    UI_MESSAGE,
    Exclude<
      ExtractChunk<UI_MESSAGE, ContentChunkType<UI_MESSAGE>>,
      ExtractChunkForPart<UI_MESSAGE, ExtractPart<UI_MESSAGE, PART_TYPE>>
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
