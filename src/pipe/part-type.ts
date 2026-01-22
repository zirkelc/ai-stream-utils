import type { UIMessage } from 'ai';
import type {
  ExtractPart,
  InferUIMessagePart,
  InferUIMessagePartType,
} from '../types.js';

/* ============================================================================
 * Type Guard for Part Types
 * ============================================================================ */

/**
 * Type guard predicate for part types.
 * Used with `.filter()` and `.match()` to narrow types.
 * Generic T allows the guard to preserve other properties (like `chunk`) from the input.
 * The __brand property is used to distinguish from plain predicates (never actually exists at runtime).
 */
export type PartTypeGuard<
  UI_MESSAGE extends UIMessage,
  PART_TYPE extends InferUIMessagePartType<UI_MESSAGE>,
> = {
  <T extends { part: { type: string } }>(
    input: T,
  ): input is T & { part: { type: PART_TYPE } };
  /** @internal Type brand - never exists at runtime */
  readonly __brand: `PartTypeGuard`;
};

/* ============================================================================
 * Helper Function
 * ============================================================================ */

/**
 * Creates a type guard that narrows by part type.
 * Use with `.filter()` and `.match()`.
 *
 * @example
 * ```typescript
 * // Filter by part type
 * pipeUIMessageStream<MyUIMessage>(stream)
 *   .filter(partType('text', 'reasoning'))
 *   .map(({ chunk, part }) => chunk);
 *
 * // Match specific part types
 * pipeUIMessageStream<MyUIMessage>(stream)
 *   .match(partType('text'), (pipe) =>
 *     pipe.map(({ chunk }) => chunk)
 *   );
 * ```
 */
export function partType<
  UI_MESSAGE extends UIMessage,
  PART_TYPE extends InferUIMessagePartType<UI_MESSAGE>,
>(...types: PART_TYPE[]): PartTypeGuard<UI_MESSAGE, PART_TYPE> {
  const guard = <T extends { part: InferUIMessagePart<UI_MESSAGE> }>(
    input: T,
  ): input is T & { part: ExtractPart<UI_MESSAGE, PART_TYPE> } =>
    (types as Array<string>).includes((input.part as { type: string }).type);

  return guard as PartTypeGuard<UI_MESSAGE, PART_TYPE>;
}
