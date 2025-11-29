import type { UIMessageChunk } from 'ai';

/**
 * State for tracking tool calls across chunks.
 */
export type ToolCallState = {
  toolName: string;
  dynamic: boolean | undefined;
};

/**
 * Maps a chunk type to its corresponding UI message part type.
 * For tool-related chunks that have complete info, returns 'tool-{toolName}' or 'dynamic-tool'.
 * For other chunks, returns the chunk type directly.
 */
export function getPartTypeFromChunk(chunk: UIMessageChunk): string {
  switch (chunk.type) {
    case 'tool-input-start':
      return chunk.dynamic ? 'dynamic-tool' : `tool-${chunk.toolName}`;

    case 'tool-input-available':
    case 'tool-input-error':
      return chunk.dynamic ? 'dynamic-tool' : `tool-${chunk.toolName}`;

    case 'start-step':
      return 'step-start';

    case 'text-start':
    case 'text-delta':
    case 'text-end':
      return 'text';

    case 'reasoning-start':
    case 'reasoning-delta':
    case 'reasoning-end':
      return 'reasoning';

    case 'file':
      return 'file';

    case 'source-url':
      return 'source-url';

    case 'source-document':
      return 'source-document';

    case 'start':
    case 'finish':
    case 'abort':
    case 'message-metadata':
    case 'error':
      return chunk.type;

    default:
      // For data-* chunks and other types, use the chunk type directly
      return chunk.type;
  }
}

/**
 * Resolves the part type for a tool-related chunk using tracked state.
 */
export function resolveToolPartType(
  chunk: UIMessageChunk,
  toolCallStates: Map<string, ToolCallState>,
): string {
  if (
    chunk.type === 'tool-input-delta' ||
    chunk.type === 'tool-output-available' ||
    chunk.type === 'tool-output-error'
  ) {
    const toolState = toolCallStates.get(
      (chunk as { toolCallId: string }).toolCallId,
    );
    if (toolState) {
      return toolState.dynamic ? 'dynamic-tool' : `tool-${toolState.toolName}`;
    }
  }
  return getPartTypeFromChunk(chunk);
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
 * Part boundary detection: identifies chunks that complete a part.
 */
export function isPartEndChunk(chunk: UIMessageChunk): boolean {
  switch (chunk.type) {
    // Text parts end with text-end
    case 'text-end':
    // Reasoning parts end with reasoning-end
    case 'reasoning-end':
    // Tool parts end with output-available or output-error
    case 'tool-output-available':
    case 'tool-output-error':
    // Single-chunk parts are their own end
    case 'file':
    case 'source-url':
    case 'source-document':
      return true;
    default:
      // Data chunks (data-*) are single-chunk parts
      if (chunk.type.startsWith('data-')) {
        return true;
      }
      return false;
  }
}

/**
 * Part boundary detection: identifies chunks that start a part.
 */
export function isPartStartChunk(chunk: UIMessageChunk): boolean {
  switch (chunk.type) {
    case 'text-start':
    case 'reasoning-start':
    case 'tool-input-start':
    case 'file':
    case 'source-url':
    case 'source-document':
      return true;
    default:
      // Data chunks (data-*) are single-chunk parts
      if (chunk.type.startsWith('data-')) {
        return true;
      }
      return false;
  }
}

/**
 * Gets the part ID from a chunk (if applicable).
 */
export function getPartIdFromChunk(chunk: UIMessageChunk): string | undefined {
  switch (chunk.type) {
    case 'text-start':
    case 'text-delta':
    case 'text-end':
    case 'reasoning-start':
    case 'reasoning-delta':
    case 'reasoning-end':
      return (chunk as { id: string }).id;
    case 'tool-input-start':
    case 'tool-input-delta':
    case 'tool-input-available':
    case 'tool-input-error':
    case 'tool-output-available':
    case 'tool-output-error':
      return (chunk as { toolCallId: string }).toolCallId;
    case 'source-url':
    case 'source-document':
      return (chunk as { sourceId: string }).sourceId;
    default:
      return undefined;
  }
}
