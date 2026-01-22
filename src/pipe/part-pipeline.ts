import { convertAsyncIteratorToReadableStream } from '@ai-sdk/provider-utils';
import type { AsyncIterableStream, InferUIMessageChunk, UIMessage } from 'ai';
import type {
  ExtractPart,
  InferUIMessagePart,
  InferUIMessagePartType,
} from '../types.js';
import { createAsyncIterableStream } from '../utils/create-async-iterable-stream.js';
import { serializePartToChunks } from '../utils/internal/serialize-part-to-chunks.js';
import type {
  BasePipeline,
  PartBuilder,
  PartFilterFn,
} from './internal-types.js';
import type { PartTypeGuard } from './part-type.js';
import type { PartInput, PartMapFn, PartPredicate } from './types.js';

/* ============================================================================
 * PartPipeline Class
 * ============================================================================ */

/**
 * Pipeline for part-based operations (after reduce()).
 * Operations receive complete parts instead of individual chunks.
 */
export class PartPipeline<
  UI_MESSAGE extends UIMessage,
  PART extends InferUIMessagePart<UI_MESSAGE>,
> implements
    BasePipeline<UI_MESSAGE>,
    AsyncIterable<InferUIMessageChunk<UI_MESSAGE>>
{
  private consumed = false;

  constructor(
    private sourceIterable: AsyncIterable<
      PartInput<InferUIMessagePart<UI_MESSAGE>>
    >,
    private prevBuilder: PartBuilder<UI_MESSAGE> = (s) => s,
  ) {}

  private assertNotConsumed(): void {
    if (this.consumed) {
      throw new Error('Pipeline has already been consumed.');
    }
  }

  /**
   * Filter parts by part type guard.
   */
  filter<PART_TYPE extends InferUIMessagePartType<UI_MESSAGE>>(
    guard: PartTypeGuard<UI_MESSAGE, PART_TYPE>,
  ): PartPipeline<UI_MESSAGE, PART & ExtractPart<UI_MESSAGE, PART_TYPE>>;
  /**
   * Filter parts by predicate.
   */
  filter(predicate: PartPredicate<PART>): PartPipeline<UI_MESSAGE, PART>;

  filter(
    predicate: PartFilterFn<UI_MESSAGE, PART>,
  ): PartPipeline<UI_MESSAGE, PART> {
    /** Cast predicate to work with full part type */
    const predicateFn = predicate as PartPredicate<
      InferUIMessagePart<UI_MESSAGE>
    >;

    const nextBuilder: PartBuilder<UI_MESSAGE> = (iterable) => {
      const prevIterable = this.prevBuilder(iterable);

      async function* filterParts(): AsyncGenerator<
        PartInput<InferUIMessagePart<UI_MESSAGE>>
      > {
        for await (const partInput of prevIterable) {
          if (predicateFn(partInput)) {
            yield partInput;
          }
        }
      }

      return filterParts();
    };

    return new PartPipeline<UI_MESSAGE, PART>(this.sourceIterable, nextBuilder);
  }

  /**
   * Transform parts.
   */
  map(fn: PartMapFn<PART>): PartPipeline<UI_MESSAGE, PART> {
    /** Cast fn to work with full part type */
    const mapFn = fn as (
      input: PartInput<InferUIMessagePart<UI_MESSAGE>>,
    ) => InferUIMessagePart<UI_MESSAGE> | null;

    const nextBuilder: PartBuilder<UI_MESSAGE> = (iterable) => {
      const prevIterable = this.prevBuilder(iterable);

      async function* mapParts(): AsyncGenerator<
        PartInput<InferUIMessagePart<UI_MESSAGE>>
      > {
        for await (const input of prevIterable) {
          const result = mapFn(input);
          if (result !== null) {
            yield {
              part: result,
              chunks: input.chunks,
            };
          }
        }
      }

      return mapParts();
    };

    return new PartPipeline<UI_MESSAGE, PART>(this.sourceIterable, nextBuilder);
  }

  /**
   * Execute the pipeline and return the resulting chunk stream.
   */
  toStream(): AsyncIterableStream<InferUIMessageChunk<UI_MESSAGE>> {
    this.assertNotConsumed();
    this.consumed = true;

    const partsIterable = this.prevBuilder(
      this.sourceIterable,
    ) as AsyncIterable<PartInput<PART>>;

    async function* emitChunks(): AsyncGenerator<
      InferUIMessageChunk<UI_MESSAGE>
    > {
      for await (const partInput of partsIterable) {
        const chunks = serializePartToChunks<UI_MESSAGE>(
          partInput.part,
          partInput.chunks as Array<InferUIMessageChunk<UI_MESSAGE>>,
        );
        for (const chunk of chunks) {
          yield chunk;
        }
      }
    }

    const outputStream = convertAsyncIteratorToReadableStream(emitChunks());

    return createAsyncIterableStream(outputStream);
  }

  [Symbol.asyncIterator](): AsyncIterator<InferUIMessageChunk<UI_MESSAGE>> {
    return this.toStream()[Symbol.asyncIterator]();
  }
}
