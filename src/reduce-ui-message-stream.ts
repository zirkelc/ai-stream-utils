import { convertAsyncIteratorToReadableStream } from '@ai-sdk/provider-utils';
import type { AsyncIterableStream, InferUIMessageChunk, UIMessage } from 'ai';
import type { PartInput } from './pipe/types.js';
import type { InferUIMessagePart } from './types.js';
import { createAsyncIterableStream } from './utils/create-async-iterable-stream.js';
import { fastReadUIMessageStream } from './utils/fast-read-ui-message-stream.js';
import {
  getPartTypeFromChunk,
  type ToolCallIdMap,
} from './utils/internal/get-part-type-from-chunk.js';
import {
  isMetaChunk,
  isStepEndChunk,
  isStepStartChunk,
} from './utils/internal/stream-utils.js';

/**
 * Buffer for accumulating chunks for a single part.
 */
type PartBuffer<UI_MESSAGE extends UIMessage> = {
  chunks: Array<InferUIMessageChunk<UI_MESSAGE>>;
  part: InferUIMessagePart<UI_MESSAGE> | undefined;
  complete: boolean;
};

/**
 * Checks if a part is complete based on its type and the current chunk.
 * Single-chunk parts (data, source, file) are immediately complete.
 * Multi-chunk parts (text, reasoning, tool) are complete when their terminal chunk arrives.
 */
function isPartComplete(partType: string, chunkType: string): boolean {
  /** Single-chunk parts are immediately complete */
  if (
    partType.startsWith(`data-`) ||
    partType === `source-url` ||
    partType === `source-document` ||
    partType === `file`
  ) {
    return true;
  }

  /** Text parts complete on text-end */
  if (partType === `text` && chunkType === `text-end`) {
    return true;
  }

  /** Reasoning parts complete on reasoning-end */
  if (partType === `reasoning` && chunkType === `reasoning-end`) {
    return true;
  }

  /** Tool parts complete on output/error chunks */
  if (
    (partType.startsWith(`tool-`) || partType === `dynamic-tool`) &&
    (chunkType === `tool-output-available` ||
      chunkType === `tool-output-error` ||
      chunkType === `tool-output-denied` ||
      chunkType === `tool-input-error`)
  ) {
    return true;
  }

  return false;
}

/**
 * Reduces a stream of chunks to complete parts.
 *
 * Buffers chunks by their part type (derived from chunk type) and emits complete parts
 * in the order they were first seen. This correctly handles interleaved chunks from
 * different part types (e.g., a data chunk between tool chunks).
 *
 * Meta chunks and step chunks are skipped - this transformer only outputs
 * complete parts.
 *
 * @example
 * ```typescript
 * // Convert chunk stream to part stream
 * const partStream = reduceUIMessageStream(chunkStream);
 *
 * for await (const { part, chunks } of partStream) {
 *   console.log('Complete part:', part);
 * }
 * ```
 */
export function reduceUIMessageStream<UI_MESSAGE extends UIMessage>(
  stream: ReadableStream<InferUIMessageChunk<UI_MESSAGE>>,
): AsyncIterableStream<PartInput<InferUIMessagePart<UI_MESSAGE>>> {
  async function* processChunks(): AsyncGenerator<
    PartInput<InferUIMessagePart<UI_MESSAGE>>
  > {
    /** Buffers keyed by part type */
    const buffers = new Map<string, PartBuffer<UI_MESSAGE>>();
    /** Order parts were first seen (for preserving emission order) */
    const partOrder: Array<string> = [];
    /** Tracks toolCallId → partType mapping for tool chunks */
    const toolCallIdMap: ToolCallIdMap = new Map();

    for await (const { chunk, message } of fastReadUIMessageStream<UI_MESSAGE>(
      stream,
    )) {
      /** Skip meta chunks and step boundaries */
      if (
        isMetaChunk(chunk) ||
        isStepStartChunk(chunk) ||
        isStepEndChunk(chunk)
      ) {
        continue;
      }

      /** Derive part type from chunk type */
      const partType = getPartTypeFromChunk<UI_MESSAGE>(chunk, toolCallIdMap);
      if (!partType) {
        continue;
      }

      /** Initialize buffer for new part type */
      if (!buffers.has(partType)) {
        partOrder.push(partType);
        buffers.set(partType, { chunks: [], part: undefined, complete: false });
      }

      const buf = buffers.get(partType)!;
      buf.chunks.push(chunk);

      /** Update part reference from message (find last matching part) */
      if (message) {
        for (let i = message.parts.length - 1; i >= 0; i--) {
          const p = message.parts[i];
          if (p && p.type === partType) {
            buf.part = p;
            break;
          }
        }
      }

      /** Check if this chunk completes the part */
      buf.complete = isPartComplete(partType, chunk.type);

      /** Emit completed parts in order (maintain first-seen order) */
      while (partOrder.length > 0) {
        const firstPartType = partOrder[0]!;
        const firstBuf = buffers.get(firstPartType)!;
        if (firstBuf.complete && firstBuf.part) {
          yield { part: firstBuf.part, chunks: firstBuf.chunks };
          partOrder.shift();
          buffers.delete(firstPartType);
        } else {
          /** Can't emit out of order - wait for first part to complete */
          break;
        }
      }
    }

    /** Emit remaining parts at stream end (may be incomplete) */
    for (const pt of partOrder) {
      const buf = buffers.get(pt)!;
      if (buf.part) {
        yield { part: buf.part, chunks: buf.chunks };
      }
    }
  }

  const outputStream = convertAsyncIteratorToReadableStream(processChunks());
  return createAsyncIterableStream(outputStream);
}
