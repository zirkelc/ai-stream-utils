import type { InferUIMessageChunk, UIMessage } from 'ai';
import { ChunkPipeline } from './pipe/chunk-pipeline.js';
import type { InternalChunk } from './pipe/internal-types.js';
import type { InferUIMessagePart } from './types.js';
import { fastReadUIMessageStream } from './utils/fast-read-ui-message-stream.js';
import {
  getPartTypeFromChunk,
  type ToolCallIdMap,
} from './utils/internal/get-part-type-from-chunk.js';
import {
  isStepEndChunk,
  isStepStartChunk,
} from './utils/internal/stream-utils.js';

export { ChunkPipeline } from './pipe/chunk-pipeline.js';
export type { ChunkTypeGuard } from './pipe/chunk-type.js';
export { chunkType } from './pipe/chunk-type.js';
export { MatchPipeline } from './pipe/match-pipeline.js';
export { PartPipeline } from './pipe/part-pipeline.js';
export type { PartTypeGuard } from './pipe/part-type.js';
export { partType } from './pipe/part-type.js';
export type {
  ChunkInput,
  ChunkMapFn,
  ChunkPredicate,
  MatchPredicate,
  PartInput,
  PartMapFn,
  PartPredicate,
  ScanOperator,
} from './pipe/types.js';

/**
 * Creates an internal iterable with part type information from a raw chunk stream.
 * Handles step boundaries (buffering start-step) and meta chunks.
 *
 * Part type is derived directly from the chunk's type rather than from message.parts[-1],
 * which ensures correct association when chunks from different part types are interleaved.
 */
function createInternalIterable<UI_MESSAGE extends UIMessage>(
  stream: ReadableStream<InferUIMessageChunk<UI_MESSAGE>>,
): AsyncIterable<InternalChunk<UI_MESSAGE>> {
  /** Buffered start-step chunk. Only emitted if content follows. */
  let bufferedStartStep: InferUIMessageChunk<UI_MESSAGE> | undefined;
  /** Tracks if start-step was emitted, so we know to emit the matching finish-step. */
  let stepStartEmitted = false;
  /** Tracks toolCallId → partType mapping for tool chunks */
  const toolCallIdMap: ToolCallIdMap = {};

  async function* generateSourceChunks(): AsyncGenerator<
    InternalChunk<UI_MESSAGE>
  > {
    for await (const { chunk } of fastReadUIMessageStream<UI_MESSAGE>(stream)) {
      /** Buffer start-step instead of emitting immediately */
      if (isStepStartChunk(chunk)) {
        bufferedStartStep = chunk;
        continue;
      }

      /** Step is ending. Only emit if we emitted the corresponding start-step */
      if (isStepEndChunk(chunk)) {
        if (stepStartEmitted) {
          yield { chunk, partType: undefined };
          stepStartEmitted = false;
        }
        bufferedStartStep = undefined;
        continue;
      }

      /** Derive part type from chunk type (undefined for meta chunks) */
      const partType = getPartTypeFromChunk<UI_MESSAGE>(chunk, toolCallIdMap);

      /** Meta chunks pass through with undefined partType */
      if (partType === undefined) {
        yield { chunk, partType: undefined };
        continue;
      }

      /** Content chunk - emit buffered start-step first if present */
      if (bufferedStartStep) {
        yield { chunk: bufferedStartStep, partType: undefined };
        stepStartEmitted = true;
        bufferedStartStep = undefined;
      }

      yield { chunk, partType };
    }
  }

  return generateSourceChunks();
}

/**
 * Creates a type-safe pipeline for UIMessageStream operations.
 *
 * @example
 * ```typescript
 * pipeUIMessageStream<MyUIMessage>(stream)
 *   .filter(partType('text'))
 *   .map(({ chunk }) => chunk)
 *   .toStream();
 * ```
 */
export function pipeUIMessageStream<UI_MESSAGE extends UIMessage>(
  stream: ReadableStream<InferUIMessageChunk<UI_MESSAGE>>,
): ChunkPipeline<
  UI_MESSAGE,
  InferUIMessageChunk<UI_MESSAGE>,
  InferUIMessagePart<UI_MESSAGE>
> {
  /** Create internal iterable with part type information */
  const sourceIterable = createInternalIterable<UI_MESSAGE>(stream);
  return new ChunkPipeline(sourceIterable);
}
