import type { InferUIMessageChunk, UIMessage } from "ai";
import { asArray } from "../internal/utils.js";
import type {
  ExtractChunkForPart,
  ExtractPart,
  InferUIMessagePart,
  InferUIMessagePartType,
} from "../types.js";
import type { InternalChunk } from "./base-pipeline.js";
import type {
  ChunkBuilder,
  ChunkFilterFn,
  ChunkInput,
  ChunkMapFn,
  ChunkPredicate,
} from "./chunk-pipeline.js";
import type { ChunkTypeGuard } from "./chunk-type.js";
import type { PartTypeGuard } from "./part-type.js";

/** @internal Symbol for accessing MatchPipeline builder */
export const BUILDER = Symbol(`builder`);

/**
 * Pipeline for match-specific operations.
 * A pure transform chain (filter/map composition).
 * Only supports filter() and map() - no reduce().
 */
export class MatchPipeline<
  UI_MESSAGE extends UIMessage,
  CHUNK extends InferUIMessageChunk<UI_MESSAGE>,
  PART extends InferUIMessagePart<UI_MESSAGE>,
> {
  /** @internal */
  [BUILDER]: ChunkBuilder<UI_MESSAGE>;

  constructor(builder: ChunkBuilder<UI_MESSAGE> = (s) => s) {
    this[BUILDER] = builder;
  }

  /**
   * Filter with part type guard - narrows both chunk and part types.
   */
  filter<PART_TYPE extends InferUIMessagePartType<UI_MESSAGE>>(
    guard: PartTypeGuard<UI_MESSAGE, PART_TYPE>,
  ): MatchPipeline<
    UI_MESSAGE,
    CHUNK & ExtractChunkForPart<UI_MESSAGE, ExtractPart<UI_MESSAGE, PART_TYPE>>,
    ExtractPart<UI_MESSAGE, PART_TYPE>
  >;

  /**
   * Filter with chunk type guard - narrows chunk type only.
   */
  filter<CHUNK_TYPE extends string>(
    guard: ChunkTypeGuard<UI_MESSAGE, CHUNK_TYPE>,
  ): MatchPipeline<
    UI_MESSAGE,
    Extract<InferUIMessageChunk<UI_MESSAGE>, { type: CHUNK_TYPE }>,
    PART
  >;

  /**
   * Filter with generic predicate.
   */
  filter(predicate: ChunkPredicate<CHUNK, PART>): MatchPipeline<UI_MESSAGE, CHUNK, PART>;

  filter(predicate: ChunkFilterFn<UI_MESSAGE, CHUNK, PART>): MatchPipeline<UI_MESSAGE, any, any> {
    const predicateFn = predicate as ChunkPredicate<CHUNK, PART>;

    const nextBuilder: ChunkBuilder<UI_MESSAGE> = (iterable) => {
      const prevIterable = this[BUILDER](iterable);

      async function* filterMatched(): AsyncGenerator<InternalChunk<UI_MESSAGE>> {
        for await (const item of prevIterable) {
          /** Meta chunks pass through (shouldn't happen in match context) */
          if (item.partType === undefined) {
            yield item;
            continue;
          }

          const input = {
            chunk: item.chunk,
            part: { type: item.partType },
          } as ChunkInput<CHUNK, PART>;

          if (predicateFn(input)) {
            yield item;
          }
        }
      }

      return filterMatched();
    };

    return new MatchPipeline(nextBuilder);
  }

  /**
   * Transform chunks.
   */
  map(fn: ChunkMapFn<UI_MESSAGE, CHUNK, PART>): MatchPipeline<UI_MESSAGE, CHUNK, PART> {
    const nextBuilder: ChunkBuilder<UI_MESSAGE> = (iterable) => {
      const prevIterable = this[BUILDER](iterable);

      async function* mapMatched(): AsyncGenerator<InternalChunk<UI_MESSAGE>> {
        for await (const item of prevIterable) {
          /** Meta chunks pass through (shouldn't happen in match context) */
          if (item.partType === undefined) {
            yield item;
            continue;
          }

          const input = {
            chunk: item.chunk,
            part: { type: item.partType },
          } as ChunkInput<CHUNK, PART>;

          const result = fn(input);
          const chunks = asArray(result);

          for (const chunk of chunks) {
            yield { chunk, partType: item.partType };
          }
        }
      }

      return mapMatched();
    };

    return new MatchPipeline(nextBuilder);
  }
}
