import type { UIMessageChunk } from 'ai';

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
