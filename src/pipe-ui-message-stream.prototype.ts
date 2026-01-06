/**
 * PROTOTYPE - API Design Only
 * This file is for testing the type system and chaining behavior.
 * Implementations return `any` to avoid errors.
 */

import type { AsyncIterableStream, InferUIMessageChunk, UIMessage } from 'ai';
import type { InferUIMessagePart, InferUIMessagePartType } from './types.js';

/* ============================================================================
 * Type Utilities
 * ============================================================================ */

/**
 * Extract a specific part type from UIMessage
 */
type ExtractPart<
  UI_MESSAGE extends UIMessage,
  PART_TYPE extends InferUIMessagePartType<UI_MESSAGE>,
> = Extract<InferUIMessagePart<UI_MESSAGE>, { type: PART_TYPE }>;

/**
 * Type guard predicate for matching part types
 */
export type PartTypePredicate<
  UI_MESSAGE extends UIMessage,
  PART_TYPE extends InferUIMessagePartType<UI_MESSAGE>,
> = (
  part: InferUIMessagePart<UI_MESSAGE>,
) => part is ExtractPart<UI_MESSAGE, PART_TYPE>;

/* ============================================================================
 * Main Pipeline Types
 * ============================================================================ */

/**
 * Input for map/filter operations on the main pipeline (chunk-based)
 */
export type PipelineInput<UI_MESSAGE extends UIMessage> = {
  chunk: InferUIMessageChunk<UI_MESSAGE>;
  part: InferUIMessagePart<UI_MESSAGE>;
};

/**
 * Predicate for filter operations
 */
export type PipelineFilterPredicate<UI_MESSAGE extends UIMessage> = (
  input: PipelineInput<UI_MESSAGE>,
) => boolean;

/**
 * Map function for chunk transformations
 */
export type PipelineMapFn<UI_MESSAGE extends UIMessage> = (
  input: PipelineInput<UI_MESSAGE>,
) =>
  | InferUIMessageChunk<UI_MESSAGE>
  | Array<InferUIMessageChunk<UI_MESSAGE>>
  | null;

/* ============================================================================
 * Match Pipeline Types (Chunk-based, before reduce)
 * ============================================================================ */

/**
 * Input for match pipeline operations (typed to specific part)
 */
export type MatchPipelineInput<
  UI_MESSAGE extends UIMessage,
  PART_TYPE extends InferUIMessagePartType<UI_MESSAGE>,
> = {
  chunk: InferUIMessageChunk<UI_MESSAGE>;
  part: ExtractPart<UI_MESSAGE, PART_TYPE>;
};

/**
 * Map function for match pipeline (chunk-based)
 */
export type MatchPipelineMapFn<
  UI_MESSAGE extends UIMessage,
  PART_TYPE extends InferUIMessagePartType<UI_MESSAGE>,
> = (
  input: MatchPipelineInput<UI_MESSAGE, PART_TYPE>,
) =>
  | InferUIMessageChunk<UI_MESSAGE>
  | Array<InferUIMessageChunk<UI_MESSAGE>>
  | null;

/**
 * Filter predicate for match pipeline (chunk-based)
 */
export type MatchPipelineFilterPredicate<
  UI_MESSAGE extends UIMessage,
  PART_TYPE extends InferUIMessagePartType<UI_MESSAGE>,
> = (input: MatchPipelineInput<UI_MESSAGE, PART_TYPE>) => boolean;

/* ============================================================================
 * Reduced Match Pipeline Types (Part-based, after reduce)
 * ============================================================================ */

/**
 * Input for reduced match pipeline operations (part only)
 */
export type ReducedMatchPipelineInput<
  UI_MESSAGE extends UIMessage,
  PART_TYPE extends InferUIMessagePartType<UI_MESSAGE>,
> = {
  part: ExtractPart<UI_MESSAGE, PART_TYPE>;
};

/**
 * Map function for reduced match pipeline (part-based)
 */
export type ReducedMatchPipelineMapFn<
  UI_MESSAGE extends UIMessage,
  PART_TYPE extends InferUIMessagePartType<UI_MESSAGE>,
> = (
  input: ReducedMatchPipelineInput<UI_MESSAGE, PART_TYPE>,
) => ExtractPart<UI_MESSAGE, PART_TYPE> | null;

/**
 * Filter predicate for reduced match pipeline (part-based)
 */
export type ReducedMatchPipelineFilterPredicate<
  UI_MESSAGE extends UIMessage,
  PART_TYPE extends InferUIMessagePartType<UI_MESSAGE>,
> = (input: ReducedMatchPipelineInput<UI_MESSAGE, PART_TYPE>) => boolean;

/* ============================================================================
 * Reduced Match Pipeline Class (Part-based)
 * ============================================================================ */

/**
 * Pipeline for working with complete parts (after reduce)
 */
export class ReducedMatchPipeline<
  UI_MESSAGE extends UIMessage,
  PART_TYPE extends InferUIMessagePartType<UI_MESSAGE>,
> {
  /**
   * Filter parts
   */
  filter(
    predicate: ReducedMatchPipelineFilterPredicate<UI_MESSAGE, PART_TYPE>,
  ): ReducedMatchPipeline<UI_MESSAGE, PART_TYPE> {
    return this as any;
  }

  /**
   * Transform parts
   */
  map(
    fn: ReducedMatchPipelineMapFn<UI_MESSAGE, PART_TYPE>,
  ): ReducedMatchPipeline<UI_MESSAGE, PART_TYPE> {
    return this as any;
  }
}

/* ============================================================================
 * Match Pipeline Class (Chunk-based)
 * ============================================================================ */

/**
 * Pipeline for working with chunks of a specific part type
 */
export class MatchPipeline<
  UI_MESSAGE extends UIMessage,
  PART_TYPE extends InferUIMessagePartType<UI_MESSAGE>,
> {
  /**
   * Filter chunks
   */
  filter(
    predicate: MatchPipelineFilterPredicate<UI_MESSAGE, PART_TYPE>,
  ): MatchPipeline<UI_MESSAGE, PART_TYPE> {
    return this as any;
  }

  /**
   * Transform chunks
   */
  map(
    fn: MatchPipelineMapFn<UI_MESSAGE, PART_TYPE>,
  ): MatchPipeline<UI_MESSAGE, PART_TYPE> {
    return this as any;
  }

  /**
   * Reduce chunks to a complete part
   * After this, the pipeline works with parts instead of chunks
   */
  reduce(): ReducedMatchPipeline<UI_MESSAGE, PART_TYPE> {
    return new ReducedMatchPipeline() as any;
  }
}

/* ============================================================================
 * Main Pipeline Class
 * ============================================================================ */

/**
 * Main pipeline for UIMessageStream operations
 */
export class UIMessageStreamPipelinePrototype<UI_MESSAGE extends UIMessage>
  implements AsyncIterable<InferUIMessageChunk<UI_MESSAGE>>
{
  constructor(
    private inputStream: ReadableStream<InferUIMessageChunk<UI_MESSAGE>>,
  ) {}

  /**
   * Filter chunks
   */
  filter(
    predicate: PipelineFilterPredicate<UI_MESSAGE>,
  ): UIMessageStreamPipelinePrototype<UI_MESSAGE> {
    return this as any;
  }

  /**
   * Transform chunks
   */
  map(
    fn: PipelineMapFn<UI_MESSAGE>,
  ): UIMessageStreamPipelinePrototype<UI_MESSAGE> {
    return this as any;
  }

  /**
   * Match specific part types and process them in a sub-pipeline
   * The sub-pipeline output is serialized back to chunks
   */
  match<PART_TYPE extends InferUIMessagePartType<UI_MESSAGE>>(
    predicate: PartTypePredicate<UI_MESSAGE, PART_TYPE>,
    handler: (
      pipe: MatchPipeline<UI_MESSAGE, PART_TYPE>,
    ) =>
      | MatchPipeline<UI_MESSAGE, PART_TYPE>
      | ReducedMatchPipeline<UI_MESSAGE, PART_TYPE>,
  ): UIMessageStreamPipelinePrototype<UI_MESSAGE> {
    return this as any;
  }

  /**
   * Execute the pipeline and return the resulting stream
   */
  toStream(): AsyncIterableStream<InferUIMessageChunk<UI_MESSAGE>> {
    return this.inputStream as any;
  }

  /**
   * AsyncIterable implementation
   */
  [Symbol.asyncIterator](): AsyncIterator<InferUIMessageChunk<UI_MESSAGE>> {
    return this.toStream()[Symbol.asyncIterator]();
  }
}

/* ============================================================================
 * Entry Point
 * ============================================================================ */

/**
 * Creates a pipeline for UIMessageStream operations
 */
export function pipeUIMessageStreamPrototype<UI_MESSAGE extends UIMessage>(
  stream: ReadableStream<InferUIMessageChunk<UI_MESSAGE>>,
): UIMessageStreamPipelinePrototype<UI_MESSAGE> {
  return new UIMessageStreamPipelinePrototype(stream);
}

/* ============================================================================
 * Helper: partTypeIsGuard (type guard version)
 * ============================================================================ */

/**
 * Creates a type guard predicate for matching part types
 */
export function partTypeIsGuard<
  UI_MESSAGE extends UIMessage,
  PART_TYPE extends InferUIMessagePartType<UI_MESSAGE>,
>(
  type: PART_TYPE | Array<PART_TYPE>,
): PartTypePredicate<UI_MESSAGE, PART_TYPE> {
  const types = Array.isArray(type) ? type : [type];
  return (part): part is ExtractPart<UI_MESSAGE, PART_TYPE> =>
    types.includes(part.type as PART_TYPE);
}

/* ============================================================================
 * Test Usage Examples
 * ============================================================================ */

import type { MyUIMessage } from './utils/test-utils.js';

declare const stream: ReadableStream<InferUIMessageChunk<MyUIMessage>>;

/* Example 1: Basic pipeline with filter and map */
const example1 = pipeUIMessageStreamPrototype<MyUIMessage>(stream)
  .filter(({ chunk, part }) => part.type !== `reasoning`)
  .map(({ chunk }) => chunk)
  .toStream();

/* Example 2: Match text parts, reduce to complete part, transform */
const example2 = pipeUIMessageStreamPrototype<MyUIMessage>(stream)
  .match(partTypeIsGuard(`text`), (textPipe) =>
    textPipe
      .reduce()
      /* After reduce: { part } is typed as TextPart */
      .map(({ part }) => ({
        ...part,
        text: part.text.toUpperCase(),
      }))
      .filter(({ part }) => part.text.length > 10),
  )
  .map(({ chunk }) => chunk)
  .toStream();

/* Example 3: Match tool-weather, work with chunks directly (no reduce) */
const example3 = pipeUIMessageStreamPrototype<MyUIMessage>(stream)
  .match(partTypeIsGuard(`tool-weather`), (toolPipe) =>
    toolPipe.map(({ chunk, part }) => {
      /* part is typed as ToolWeatherPart */
      if (part.input) {
        console.log(part.input.location);
      }
      return chunk;
    }),
  )
  .toStream();

/* Example 4: Multiple matches chained */
const example4 = pipeUIMessageStreamPrototype<MyUIMessage>(stream)
  .filter(({ part }) => part.type !== `file`)
  .match(partTypeIsGuard<MyUIMessage, `text`>(`text`), (textPipe) =>
    textPipe
      .reduce()
      .map(({ part }) => ({ ...part, text: `[TEXT] ${part.text}` })),
  )
  .match(
    partTypeIsGuard<MyUIMessage, `reasoning`>(`reasoning`),
    (reasoningPipe) =>
      reasoningPipe
        .reduce()
        .map(({ part }) => ({ ...part, text: `[REASONING] ${part.text}` })),
  )
  .map(({ chunk }) => chunk)
  .toStream();

/* Example 5: Match without reduce (chunk-level transformation) */
const example5 = pipeUIMessageStreamPrototype<MyUIMessage>(stream)
  .match(partTypeIsGuard<MyUIMessage, `text`>(`text`), (textPipe) =>
    textPipe
      .filter(({ chunk }) => chunk.type !== `text-start`)
      .map(({ chunk, part }) => {
        if (chunk.type === `text-delta`) {
          return { ...chunk, delta: chunk.delta.toUpperCase() };
        }
        return chunk;
      }),
  )
  .toStream();
