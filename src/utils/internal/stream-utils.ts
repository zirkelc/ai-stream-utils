import type { UIMessageChunk } from 'ai';

/**
 * State for tracking tool calls across chunks.
 */
export type ToolCallState = {
  toolName: string;
  dynamic: boolean | undefined;
};

/**
 * Maps a chunk to its corresponding UI message part type.
 * For tool-related chunks, returns 'tool-{toolName}' or 'dynamic-tool'.
 */
export function getPartTypeFromChunk(
  chunk: UIMessageChunk,
  toolCallStates?: Map<string, ToolCallState>,
): string {
  switch (chunk.type) {
    case `tool-input-start`:
    case `tool-input-available`:
    case `tool-input-error`: {
      const toolChunk = chunk as {
        toolName: string;
        dynamic?: boolean;
      };
      return toolChunk.dynamic ? `dynamic-tool` : `tool-${toolChunk.toolName}`;
    }

    case `tool-input-delta`:
    case `tool-output-available`:
    case `tool-output-error`: {
      const toolChunk = chunk as { toolCallId: string; dynamic?: boolean };
      if (toolChunk.dynamic) return `dynamic-tool`;
      const toolState = toolCallStates?.get(toolChunk.toolCallId);
      if (toolState) {
        return toolState.dynamic
          ? `dynamic-tool`
          : `tool-${toolState.toolName}`;
      }
      return `dynamic-tool`; // fallback
    }

    case `text-start`:
    case `text-delta`:
    case `text-end`:
      return `text`;

    case `reasoning-start`:
    case `reasoning-delta`:
    case `reasoning-end`:
      return `reasoning`;

    case `file`:
      return `file`;

    case `source-url`:
      return `source-url`;

    case `source-document`:
      return `source-document`;

    default:
      // For data-* chunks and other types, use the chunk type directly
      return chunk.type;
  }
}

/**
 * Checks if a chunk is a control/meta chunk that should always pass through.
 */
export function isMetaChunk(chunk: UIMessageChunk): boolean {
  return (
    chunk.type === 'start' ||
    chunk.type === 'finish' ||
    chunk.type === 'abort' ||
    chunk.type === 'message-metadata' ||
    chunk.type === 'error'
  );
}

export function isMessageDataChunk(chunk: UIMessageChunk): boolean {
  return chunk.type.startsWith('data-');
}

/**
 * Checks if a chunk marks the start of a message.
 */
export function isMessageStartChunk(chunk: UIMessageChunk): boolean {
  return chunk.type === 'start';
}

/**
 * Checks if a chunk marks the end of a message.
 */
export function isMessageEndChunk(chunk: UIMessageChunk): boolean {
  return chunk.type === 'finish' || chunk.type === 'abort';
}

/**
 * Checks if a chunk marks the start of a step.
 */
export function isStepStartChunk(chunk: UIMessageChunk): boolean {
  return chunk.type === 'start-step';
}

/**
 * Checks if a chunk marks the end of a step.
 */
export function isStepEndChunk(chunk: UIMessageChunk): boolean {
  return chunk.type === 'finish-step';
}

/**
 * Normalizes a value to an array.
 * - null -> empty array
 * - array -> array as-is
 * - single value -> array with one element
 */
export function asArray<T>(value: T | T[] | null): T[] {
  if (value === null) {
    return [];
  }
  if (Array.isArray(value)) {
    return value;
  }
  return [value];
}
