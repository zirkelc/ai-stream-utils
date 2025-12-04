import type { UIMessage } from 'ai';

export type InferUIMessagePart<UI_MESSAGE extends UIMessage> =
  UI_MESSAGE['parts'][number];

export type InferUIMessagePartType<UI_MESSAGE extends UIMessage> =
  InferUIMessagePart<UI_MESSAGE>['type'];

/**
 * A partial part reconstructed from the current chunk.
 * Contains the part type and any available data from the chunk.
 */
export type InferPartialUIMessagePart<UI_MESSAGE extends UIMessage> = {
  /** The part type (e.g., 'text', 'reasoning', 'tool-weather', 'file') */
  type: InferUIMessagePartType<UI_MESSAGE>;
} & Partial<Omit<InferUIMessagePart<UI_MESSAGE>, 'type'>>;
