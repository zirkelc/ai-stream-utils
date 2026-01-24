/**
 * Smooth Streaming Example
 *
 * Demonstrates how to use pipeUIMessageStream with smoothStreaming() operator.
 * Buffers text-delta chunks and re-emits them based on word or custom boundaries.
 *
 * This mirrors the AI SDK's smoothStream function behavior.
 */

import { type InferUIMessageChunk, streamText, type UIMessage } from 'ai';
import {
  type ChunkInput,
  type InferUIMessagePart,
  pipeUIMessageStream,
  type ScanOperator,
} from '../src/index.js';
import { createMockModel, textToChunks } from '../src/utils/test/mock-model.js';

const result = streamText({
  model: createMockModel({
    chunks: textToChunks({
      text: `Why don't scientists trust atoms? Because they make up everything.`,
      seperator: ` `,
    }),
  }),
  prompt: `Tell me a joke.`,
});

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
function smoothStreaming<UI_MESSAGE extends UIMessage>(
  options?: SmoothStreamingOptions,
): ScanOperator<
  UI_MESSAGE,
  SmoothStreamingState,
  InferUIMessageChunk<UI_MESSAGE>,
  InferUIMessagePart<UI_MESSAGE>
> {
  const pattern = options?.pattern ?? /\S+\s+/m;

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

/**
 * Using pipeUIMessageStream with smoothStreaming() operator.
 * The smoothStreaming() operator buffers text and emits on word boundaries.
 */
const smoothedStream = pipeUIMessageStream(result.toUIMessageStream())
  .scan(smoothStreaming())
  .toStream();

for await (const chunk of smoothedStream) {
  console.log(chunk);
}
/** Each text chunk is now a full word:
 * { type: 'text-start'}
 * { type: 'text-delta', delta: 'Why ' }
 * { type: 'text-delta', delta: "don't " }
 * { type: 'text-delta', delta: 'scientists ' }
 * { type: 'text-delta', delta: 'trust ' }
 * { type: 'text-delta', delta: 'atoms? ' }
 * { type: 'text-delta', delta: 'Because ' }
 * { type: 'text-delta', delta: 'they ' }
 * { type: 'text-delta', delta: 'make ' }
 * { type: 'text-delta', delta: 'up ' }
 * { type: 'text-delta', delta: 'everything.' }
 * { type: 'text-end' }
 */
