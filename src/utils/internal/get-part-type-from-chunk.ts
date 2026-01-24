import type { InferUIMessageChunk, UIMessage } from 'ai';

/**
 * Tracks toolCallId to partType mapping for tool chunks.
 * This is needed because only `tool-input-start` has the `toolName` and `dynamic` flag,
 * while other tool chunks only have `toolCallId`.
 */
export type ToolCallIdMap = Map<string, string>;

/**
 * Derives the part type directly from a chunk's type.
 * This avoids relying on `message.parts[-1]` which can be incorrect
 * when chunks from different part types are interleaved.
 *
 * @param chunk - The chunk to derive part type from
 * @param toolCallIdMap - Map to track toolCallId → partType for tool chunks
 * @returns The part type string, or undefined for meta chunks
 */
export function getPartTypeFromChunk<UI_MESSAGE extends UIMessage>(
  chunk: InferUIMessageChunk<UI_MESSAGE>,
  toolCallIdMap: ToolCallIdMap,
): string | undefined {
  const chunkType = chunk.type;

  switch (chunkType) {
    /** Text chunks → 'text' part */
    case `text-start`:
    case `text-delta`:
    case `text-end`:
      return `text`;

    /** Reasoning chunks → 'reasoning' part */
    case `reasoning-start`:
    case `reasoning-delta`:
    case `reasoning-end`:
      return `reasoning`;

    /** Tool input start - has toolName and dynamic flag */
    case `tool-input-start`: {
      const c = chunk as {
        toolCallId: string;
        toolName: string;
        dynamic?: boolean;
      };
      const partType = c.dynamic ? `dynamic-tool` : `tool-${c.toolName}`;
      toolCallIdMap.set(c.toolCallId, partType);
      return partType;
    }

    /** Tool chunks with toolCallId only - lookup from map */
    case `tool-input-delta`:
    case `tool-input-available`:
    case `tool-input-error`:
    case `tool-output-available`:
    case `tool-output-error`:
    case `tool-output-denied`:
    case `tool-approval-request`: {
      const c = chunk as { toolCallId: string };
      return toolCallIdMap.get(c.toolCallId);
    }

    /** Source chunks */
    case `source-url`:
      return `source-url`;
    case `source-document`:
      return `source-document`;

    /** File chunk */
    case `file`:
      return `file`;

    /** Meta chunks - return undefined */
    case `start`:
    case `finish`:
    case `start-step`:
    case `finish-step`:
    case `error`:
    case `abort`:
    case `message-metadata`:
      return undefined;

    /** Data chunks (data-*) and any other custom chunks */
    default:
      if (chunkType.startsWith(`data-`)) {
        return chunkType;
      }
      /** Unknown chunk type - could be custom, return the type as-is */
      return chunkType;
  }
}
