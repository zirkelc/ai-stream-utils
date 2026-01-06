import type { UIMessage } from 'ai';

export type InferUIMessagePart<UI_MESSAGE extends UIMessage> =
  UI_MESSAGE['parts'][number];

export type InferUIMessagePartType<UI_MESSAGE extends UIMessage> =
  InferUIMessagePart<UI_MESSAGE>['type'];

/**
 * Extract a specific part type from UIMessage
 */
export type ExtractPart<
  UI_MESSAGE extends UIMessage,
  PART_TYPE extends InferUIMessagePartType<UI_MESSAGE>,
> = Extract<InferUIMessagePart<UI_MESSAGE>, { type: PART_TYPE }>;

/**
 * Exclude specific part types from UIMessage, returns the remaining part types
 */
export type ExcludePart<
  UI_MESSAGE extends UIMessage,
  PART_TYPE extends InferUIMessagePartType<UI_MESSAGE>,
> = Exclude<InferUIMessagePart<UI_MESSAGE>, { type: PART_TYPE }>;

/**
 * Get the type string of excluded parts (the remaining part types)
 */
export type ExcludePartType<
  UI_MESSAGE extends UIMessage,
  PART_TYPE extends InferUIMessagePartType<UI_MESSAGE>,
> = ExcludePart<UI_MESSAGE, PART_TYPE>['type'];
