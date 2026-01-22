import type { InferUIMessageChunk, UIMessage } from 'ai';
import type { ChunkInput, ScanOperator } from './pipe-ui-message-stream.js';
import type { InferUIMessagePart } from './types.js';

/**
 * State for smooth streaming operator.
 */
type SmoothStreamingState = {
  buffer: string;
  id: string;
};

/**
 * Options for the smoothStreaming operator.
 */
export type SmoothStreamingOptions = {
  /**
   * Regex pattern for splitting text.
   * Default: /\S+\s+/m (word + trailing whitespace)
   */
  pattern?: RegExp;
  /**
   * Part types to transform.
   * Default: ['text']
   */
  partTypes?: Array<string>;
};

/**
 * Creates a ScanOperator that buffers text-delta chunks and re-emits them
 * on word or custom boundaries. Useful for smooth streaming effects.
 *
 * @example
 * ```typescript
 * // Default: emit on word boundaries
 * pipe.scan(smoothStreaming())
 *
 * // Custom: emit on sentence boundaries
 * pipe.scan(smoothStreaming({ pattern: /[.!?]\s+/m }))
 *
 * // Custom: apply to specific part types
 * pipe.scan(smoothStreaming({ partTypes: ['text', 'reasoning'] }))
 * ```
 */
export function smoothStreaming<UI_MESSAGE extends UIMessage>(
  options?: SmoothStreamingOptions,
): ScanOperator<
  UI_MESSAGE,
  SmoothStreamingState,
  InferUIMessageChunk<UI_MESSAGE>,
  InferUIMessagePart<UI_MESSAGE>
> {
  const pattern = options?.pattern ?? /\S+\s+/m;
  const partTypes = options?.partTypes ?? [`text`];

  return {
    initial: () => ({ buffer: ``, id: `` }),
    reducer: (
      state: SmoothStreamingState,
      {
        chunk,
        part,
      }: ChunkInput<
        InferUIMessageChunk<UI_MESSAGE>,
        InferUIMessagePart<UI_MESSAGE>
      >,
    ) => {
      /** Only process specified part types */
      if (!partTypes.includes(part.type)) {
        return chunk;
      }

      /** Non-text-delta: flush buffer, pass through */
      if (chunk.type !== `text-delta`) {
        if (state.buffer.length > 0) {
          const flushed = {
            type: `text-delta` as const,
            id: state.id,
            delta: state.buffer,
          };
          state.buffer = ``;
          return [flushed, chunk] as Array<InferUIMessageChunk<UI_MESSAGE>>;
        }
        return chunk;
      }

      /** Handle id change: flush old buffer first */
      const textDelta = chunk as {
        type: `text-delta`;
        id: string;
        delta: string;
      };
      if (textDelta.id !== state.id && state.buffer.length > 0) {
        const flushed = {
          type: `text-delta` as const,
          id: state.id,
          delta: state.buffer,
        };
        state.buffer = textDelta.delta;
        state.id = textDelta.id;
        return [flushed] as Array<InferUIMessageChunk<UI_MESSAGE>>;
      }

      /** Buffer text deltas */
      state.buffer += textDelta.delta;
      state.id = textDelta.id;

      const chunks: Array<{ type: `text-delta`; id: string; delta: string }> =
        [];
      let match: RegExpExecArray | null = null;

      /** Split text matching the regex into new chunks */
      // biome-ignore lint/suspicious/noAssignInExpressions: okay to assign in while loop
      while ((match = pattern.exec(state.buffer)) !== null) {
        /** Only emit if match starts at beginning of buffer */
        if (match.index === 0) {
          chunks.push({ type: `text-delta`, id: state.id, delta: match[0] });
          state.buffer = state.buffer.slice(match[0].length);
        } else {
          /** There's content before the match - wait for more data */
          break;
        }
      }

      return chunks.length > 0
        ? (chunks as Array<InferUIMessageChunk<UI_MESSAGE>>)
        : null;
    },
    finalize: (state: SmoothStreamingState) => {
      /** Finalize remaining buffer at end */
      if (state.buffer.length > 0) {
        return {
          type: `text-delta` as const,
          id: state.id,
          delta: state.buffer,
        } as InferUIMessageChunk<UI_MESSAGE>;
      }
      return null;
    },
  };
}
