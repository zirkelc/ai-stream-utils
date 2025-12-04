import type { AsyncIterableStream, InferUIMessageChunk, UIMessage } from 'ai';
import { readUIMessageStream } from 'ai';
import { createAsyncIterableStream } from './create-async-iterable-stream.js';
import {
  isMetaChunk,
  isStepEndChunk,
  isStepStartChunk,
} from './stream-utils.js';
import type { InferPartialUIMessagePart } from './types.js';

/**
 * Input object provided to the chunk map function.
 */
export type MapInput<UI_MESSAGE extends UIMessage> = {
  /** The current chunk */
  chunk: InferUIMessageChunk<UI_MESSAGE>;
  /**
   * A partial representation of the part this chunk belongs to.
   * Use `part.type` to determine the part type.
   */
  part: InferPartialUIMessagePart<UI_MESSAGE>;
};

/**
 * Context provided to the chunk map function (similar to Array.map callback).
 */
export type MapContext<UI_MESSAGE extends UIMessage> = {
  /** The index of the current chunk in the stream (0-based) */
  index: number;
  /** All chunks seen so far (including the current one) */
  chunks: InferUIMessageChunk<UI_MESSAGE>[];
};

/**
 * Map function for chunk-level transformation.
 * Similar to Array.map, receives the input object and context.
 * Return the chunk (possibly transformed) to include it, or null to filter it out.
 */
export type MapUIMessageStreamFn<UI_MESSAGE extends UIMessage> = (
  input: MapInput<UI_MESSAGE>,
  context: MapContext<UI_MESSAGE>,
) => InferUIMessageChunk<UI_MESSAGE> | null;

/**
 * Maps/filters a UIMessageStream at the chunk level using readUIMessageStream.
 *
 * This implementation uses readUIMessageStream from AI SDK for building partial parts,
 * eliminating manual tool state tracking.
 *
 * This function processes each chunk as it arrives and allows you to:
 * - Transform chunks by returning a modified chunk
 * - Filter out chunks by returning null
 *
 * Meta chunks (start, finish, abort, message-metadata, error) always pass through.
 * Step boundaries (start-step, finish-step) are handled automatically:
 * - start-step is buffered and only emitted if subsequent content is included
 * - finish-step is only emitted if the corresponding start-step was emitted
 *
 * @example
 * ```typescript
 * // Filter out reasoning chunks using part.type
 * const stream = mapUIMessageStream(
 *   inputStream,
 *   ({ chunk, part }) => part.type === 'reasoning' ? null : chunk
 * );
 *
 * // Transform text chunks
 * const stream = mapUIMessageStream(
 *   inputStream,
 *   ({ chunk, part }) => {
 *     if (chunk.type === 'text-delta') {
 *       return { ...chunk, delta: chunk.delta.toUpperCase() };
 *     }
 *     return chunk;
 *   }
 * );
 *
 * // Access previous chunks and index
 * const stream = mapUIMessageStream(
 *   inputStream,
 *   ({ chunk }, { index, chunks }) => {
 *     console.log(`Processing chunk ${index} of ${chunks.length}`);
 *     return chunk;
 *   }
 * );
 * ```
 */
export function mapUIMessageStream<UI_MESSAGE extends UIMessage>(
  stream: ReadableStream<InferUIMessageChunk<UI_MESSAGE>>,
  mapFn: MapUIMessageStreamFn<UI_MESSAGE>,
): AsyncIterableStream<InferUIMessageChunk<UI_MESSAGE>> {
  const reader = stream.getReader();

  // Stream for readUIMessageStream - it will assemble parts
  let uiStreamController: ReadableStreamDefaultController<
    InferUIMessageChunk<UI_MESSAGE>
  >;
  const uiStream = new ReadableStream<InferUIMessageChunk<UI_MESSAGE>>({
    start(controller) {
      uiStreamController = controller;
    },
  });

  // Start readUIMessageStream
  const uiMessages = readUIMessageStream<UI_MESSAGE>({ stream: uiStream });
  const uiMessageIterator = uiMessages[Symbol.asyncIterator]();

  // Output stream
  const outputTransform = new TransformStream<
    InferUIMessageChunk<UI_MESSAGE>,
    InferUIMessageChunk<UI_MESSAGE>
  >();
  const outputWriter = outputTransform.writable.getWriter();

  // State for step boundary handling
  let bufferedStartStep: InferUIMessageChunk<UI_MESSAGE> | undefined;
  let stepStartEnqueued = false;
  let stepHasContent = false;

  // Track all chunks and current index for context
  const allChunks: InferUIMessageChunk<UI_MESSAGE>[] = [];
  let currentIndex = 0;

  /**
   * Emit a chunk to output, handling step boundary buffering.
   */
  async function emitChunk(chunk: InferUIMessageChunk<UI_MESSAGE>) {
    if (bufferedStartStep && !stepHasContent) {
      stepHasContent = true;
      await outputWriter.write(bufferedStartStep);
      stepStartEnqueued = true;
      bufferedStartStep = undefined;
    }
    await outputWriter.write(chunk);
  }

  /**
   * Main processing loop.
   */
  async function processChunks() {
    try {
      while (true) {
        const { done, value: chunk } = await reader.read();
        if (done) {
          uiStreamController.close();
          break;
        }

        // Track chunks for context
        allChunks.push(chunk);
        const index = currentIndex++;

        // Meta chunks pass through immediately
        if (isMetaChunk(chunk)) {
          await outputWriter.write(chunk);
          // Feed to uiStream but don't await (may or may not emit)
          uiStreamController.enqueue(chunk);
          continue;
        }

        // Step boundaries - special handling (don't trigger message emission)
        if (isStepStartChunk(chunk)) {
          bufferedStartStep = chunk;
          stepHasContent = false;
          uiStreamController.enqueue(chunk);
          continue;
        }

        if (isStepEndChunk(chunk)) {
          if (stepStartEnqueued) {
            await outputWriter.write(chunk);
            stepStartEnqueued = false;
          }
          bufferedStartStep = undefined;
          uiStreamController.enqueue(chunk);
          continue;
        }

        // For content chunks: feed to uiStream and get updated message
        uiStreamController.enqueue(chunk);
        const { done: iterDone, value: message } =
          await uiMessageIterator.next();

        if (iterDone || !message) {
          break;
        }

        // Get the current partial part from AI SDK (last content part)
        const contentParts = message.parts.filter(
          (p) => p.type !== 'step-start',
        );
        const currentPart = contentParts[contentParts.length - 1]!;

        // Apply map function
        // Cast through unknown since AI SDK part types may not exactly match InferPartialUIMessagePart
        const result = mapFn(
          {
            chunk,
            part: currentPart as unknown as InferPartialUIMessagePart<UI_MESSAGE>,
          },
          { index, chunks: allChunks },
        );

        // If result is null, filter out this chunk
        if (result !== null) {
          await emitChunk(result);
        }
      }

      // Drain any remaining messages from iterator
      while (true) {
        const { done } = await uiMessageIterator.next();
        if (done) break;
      }

      // Close output stream
      await outputWriter.close();
    } catch (error) {
      uiStreamController.error(error);
      await outputWriter.abort(error);
    } finally {
      reader.releaseLock();
      allChunks.length = 0;
      currentIndex = 0;
    }
  }

  // Start processing
  processChunks();

  return createAsyncIterableStream(outputTransform.readable);
}
