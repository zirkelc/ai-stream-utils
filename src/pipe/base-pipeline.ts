import type { AsyncIterableStream, InferUIMessageChunk, UIMessage } from "ai";

/**
 * Internal chunk representation used within the pipeline.
 * Includes the original chunk and the part type (or undefined for meta chunks).
 */
export type InternalChunk<UI_MESSAGE extends UIMessage> = {
  chunk: InferUIMessageChunk<UI_MESSAGE>;
  partType: string | undefined;
};

/**
 * Base interface for all pipeline types.
 */
export interface BasePipeline<UI_MESSAGE extends UIMessage> {
  toStream(): AsyncIterableStream<InferUIMessageChunk<UI_MESSAGE>>;
}
