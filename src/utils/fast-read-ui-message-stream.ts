import {
  type DataUIPart,
  type DynamicToolUIPart,
  type InferUIMessageChunk,
  isToolOrDynamicToolUIPart,
  isToolUIPart,
  type ReasoningUIPart,
  type TextUIPart,
  type ToolUIPart,
  type UIMessage,
  type UIMessageChunk,
} from 'ai';
import { defu } from 'defu';

/**
 * State object for tracking message assembly during streaming.
 * This is mutated in-place for performance.
 */
export type FastStreamingState<UI_MESSAGE extends UIMessage> = {
  message: UI_MESSAGE;
  activeTextParts: Record<string, TextUIPart>;
  activeReasoningParts: Record<string, ReasoningUIPart>;
  /* Accumulates raw JSON text for tool inputs (not parsed until tool-input-available) */
  partialToolCallTexts: Record<string, string>;
};

/**
 * Creates the initial streaming state for message assembly.
 */
export function createFastStreamingState<UI_MESSAGE extends UIMessage>(
  messageId = ``,
): FastStreamingState<UI_MESSAGE> {
  return {
    message: {
      id: messageId,
      role: `assistant`,
      parts: [],
      metadata: undefined,
    } as unknown as UI_MESSAGE,
    activeTextParts: {},
    activeReasoningParts: {},
    partialToolCallTexts: {},
  };
}

/**
 * Processes a single chunk and updates the state.
 * Returns true if the message should be yielded (i.e., a content change occurred).
 *
 * This is a synchronous function - no async operations, no structuredClone.
 */
export function processChunkFast<UI_MESSAGE extends UIMessage>(
  state: FastStreamingState<UI_MESSAGE>,
  chunk: UIMessageChunk,
): boolean {
  const parts = state.message.parts;

  switch (chunk.type) {
    /* ===== Meta chunks ===== */
    case `start`: {
      if (chunk.messageId != null) {
        state.message.id = chunk.messageId;
      }
      if (chunk.messageMetadata != null) {
        state.message.metadata = defu(
          chunk.messageMetadata as object,
          state.message.metadata as object,
        ) as UI_MESSAGE[`metadata`];
      }
      /* Only yield if there was actual content to set */
      return chunk.messageId != null || chunk.messageMetadata != null;
    }

    case `finish`: {
      if (chunk.messageMetadata != null) {
        state.message.metadata = defu(
          chunk.messageMetadata as object,
          state.message.metadata as object,
        ) as UI_MESSAGE[`metadata`];
        return true;
      }
      return false;
    }

    case `message-metadata`: {
      if (chunk.messageMetadata != null) {
        state.message.metadata = defu(
          chunk.messageMetadata as object,
          state.message.metadata as object,
        ) as UI_MESSAGE[`metadata`];
        return true;
      }
      return false;
    }

    case `error`:
    case `abort`: {
      /* These don't modify the message - just control flow */
      return false;
    }

    /* ===== Step chunks ===== */
    case `start-step`: {
      parts.push({ type: `step-start` });
      /* AI SDK doesn't yield for start-step */
      return false;
    }

    case `finish-step`: {
      /* Reset active parts for new step */
      state.activeTextParts = {};
      state.activeReasoningParts = {};
      return false;
    }

    /* ===== Text chunks ===== */
    case `text-start`: {
      const textPart: TextUIPart = {
        type: `text`,
        text: ``,
        providerMetadata: chunk.providerMetadata,
        state: `streaming`,
      };
      state.activeTextParts[chunk.id] = textPart;
      parts.push(textPart);
      return true;
    }

    case `text-delta`: {
      const textPart = state.activeTextParts[chunk.id];
      if (textPart) {
        textPart.text += chunk.delta;
        if (chunk.providerMetadata) {
          textPart.providerMetadata = chunk.providerMetadata;
        }
      }
      return true;
    }

    case `text-end`: {
      const textPart = state.activeTextParts[chunk.id];
      if (textPart) {
        textPart.state = `done`;
        if (chunk.providerMetadata) {
          textPart.providerMetadata = chunk.providerMetadata;
        }
        delete state.activeTextParts[chunk.id];
      }
      return true;
    }

    /* ===== Reasoning chunks ===== */
    case `reasoning-start`: {
      const reasoningPart: ReasoningUIPart = {
        type: `reasoning`,
        text: ``,
        providerMetadata: chunk.providerMetadata,
        state: `streaming`,
      };
      state.activeReasoningParts[chunk.id] = reasoningPart;
      parts.push(reasoningPart);
      return true;
    }

    case `reasoning-delta`: {
      const reasoningPart = state.activeReasoningParts[chunk.id];
      if (reasoningPart) {
        reasoningPart.text += chunk.delta;
        if (chunk.providerMetadata) {
          reasoningPart.providerMetadata = chunk.providerMetadata;
        }
      }
      return true;
    }

    case `reasoning-end`: {
      const reasoningPart = state.activeReasoningParts[chunk.id];
      if (reasoningPart) {
        reasoningPart.state = `done`;
        if (chunk.providerMetadata) {
          reasoningPart.providerMetadata = chunk.providerMetadata;
        }
        delete state.activeReasoningParts[chunk.id];
      }
      return true;
    }

    /* ===== File chunk ===== */
    case `file`: {
      parts.push({
        type: `file`,
        mediaType: chunk.mediaType,
        url: chunk.url,
      });
      return true;
    }

    /* ===== Source chunks ===== */
    case `source-url`: {
      parts.push({
        type: `source-url`,
        sourceId: chunk.sourceId,
        url: chunk.url,
        title: chunk.title,
        providerMetadata: chunk.providerMetadata,
      });
      return true;
    }

    case `source-document`: {
      parts.push({
        type: `source-document`,
        sourceId: chunk.sourceId,
        mediaType: chunk.mediaType,
        title: chunk.title,
        filename: chunk.filename,
        providerMetadata: chunk.providerMetadata,
      });
      return true;
    }

    /* ===== Tool chunks ===== */
    case `tool-input-start`: {
      /* Initialize text accumulator for partial JSON */
      state.partialToolCallTexts[chunk.toolCallId] = ``;

      if (chunk.dynamic) {
        parts.push({
          type: `dynamic-tool`,
          toolName: chunk.toolName,
          toolCallId: chunk.toolCallId,
          state: `input-streaming`,
          input: undefined,
          title: chunk.title,
          providerExecuted: chunk.providerExecuted,
        });
      } else {
        parts.push({
          type: `tool-${chunk.toolName}`,
          toolCallId: chunk.toolCallId,
          state: `input-streaming`,
          input: undefined,
          title: chunk.title,
          providerExecuted: chunk.providerExecuted,
        });
      }
      return true;
    }

    case `tool-input-delta`: {
      /* Just accumulate text - NO partial JSON parsing for performance */
      if (state.partialToolCallTexts[chunk.toolCallId] !== undefined) {
        state.partialToolCallTexts[chunk.toolCallId] += chunk.inputTextDelta;
      }
      /* Still yield so callers know there was a delta, but input remains undefined */
      return true;
    }

    case `tool-input-available`: {
      const toolPart = parts.find(
        (p): p is ToolUIPart | DynamicToolUIPart =>
          isToolOrDynamicToolUIPart(p) && p.toolCallId === chunk.toolCallId,
      );

      if (toolPart) {
        const anyPart = toolPart as any;
        toolPart.state = `input-available`;
        toolPart.input = chunk.input;
        if (chunk.providerExecuted !== undefined) {
          toolPart.providerExecuted = chunk.providerExecuted;
        }
        if (chunk.providerMetadata) {
          anyPart.callProviderMetadata = chunk.providerMetadata;
        }
        if (chunk.title !== undefined) {
          toolPart.title = chunk.title;
        }
      }
      /* Clean up text accumulator */
      delete state.partialToolCallTexts[chunk.toolCallId];
      return true;
    }

    case `tool-input-error`: {
      if (chunk.dynamic) {
        const part = parts.find(
          (p): p is DynamicToolUIPart =>
            p.type === `dynamic-tool` && p.toolCallId === chunk.toolCallId,
        );

        if (part) {
          const anyPart = part as any;
          part.state = `output-error`;
          part.input = chunk.input;
          part.errorText = chunk.errorText;
          if (chunk.providerExecuted !== undefined) {
            part.providerExecuted = chunk.providerExecuted;
          }
          if (chunk.providerMetadata) {
            anyPart.callProviderMetadata = chunk.providerMetadata;
          }
        } else {
          parts.push({
            type: `dynamic-tool`,
            toolName: chunk.toolName,
            toolCallId: chunk.toolCallId,
            state: `output-error`,
            input: chunk.input,
            errorText: chunk.errorText,
            providerExecuted: chunk.providerExecuted,
          });
        }
      } else {
        const part = parts.find(
          (p): p is ToolUIPart =>
            isToolUIPart(p) && p.toolCallId === chunk.toolCallId,
        );

        if (part) {
          const anyPart = part as any;
          part.state = `output-error`;
          anyPart.rawInput = chunk.input;
          part.errorText = chunk.errorText;
          if (chunk.providerExecuted !== undefined) {
            part.providerExecuted = chunk.providerExecuted;
          }
          if (chunk.providerMetadata) {
            anyPart.callProviderMetadata = chunk.providerMetadata;
          }
        } else {
          parts.push({
            type: `tool-${chunk.toolName}`,
            toolCallId: chunk.toolCallId,
            state: `output-error`,
            input: undefined,
            rawInput: chunk.input,
            errorText: chunk.errorText,
            providerExecuted: chunk.providerExecuted,
          });
        }
      }
      return true;
    }

    case `tool-approval-request`: {
      const toolPart = parts.find(
        (p): p is ToolUIPart | DynamicToolUIPart =>
          isToolOrDynamicToolUIPart(p) && p.toolCallId === chunk.toolCallId,
      );

      if (toolPart) {
        toolPart.state = `approval-requested`;
        toolPart.approval = { id: chunk.approvalId };
      }
      return true;
    }

    case `tool-output-denied`: {
      const toolPart = parts.find(
        (p): p is ToolUIPart | DynamicToolUIPart =>
          isToolOrDynamicToolUIPart(p) && p.toolCallId === chunk.toolCallId,
      );

      if (toolPart) {
        toolPart.state = `output-denied`;
      }
      return true;
    }

    case `tool-output-available`: {
      const toolPart = parts.find(
        (p): p is ToolUIPart | DynamicToolUIPart =>
          isToolOrDynamicToolUIPart(p) && p.toolCallId === chunk.toolCallId,
      );

      if (toolPart) {
        const anyPart = toolPart as any;
        toolPart.state = `output-available`;
        toolPart.output = chunk.output;
        if (chunk.providerExecuted !== undefined) {
          toolPart.providerExecuted = chunk.providerExecuted;
        }
        if (chunk.preliminary !== undefined) {
          anyPart.preliminary = chunk.preliminary;
        }
      }
      return true;
    }

    case `tool-output-error`: {
      const toolPart = parts.find(
        (p): p is ToolUIPart | DynamicToolUIPart =>
          isToolOrDynamicToolUIPart(p) && p.toolCallId === chunk.toolCallId,
      );

      if (toolPart) {
        toolPart.state = `output-error`;
        toolPart.errorText = chunk.errorText;
        if (chunk.providerExecuted !== undefined) {
          toolPart.providerExecuted = chunk.providerExecuted;
        }
      }
      return true;
    }

    /* ===== Data chunks (custom data-* types) ===== */
    default: {
      /* Handle data-* chunks */
      if (chunk.type.startsWith(`data-`)) {
        /* Cast to access chunk-specific properties (transient) and part properties (data) */
        const dataChunk = chunk as {
          type: string;
          id?: string;
          data: unknown;
          transient?: boolean;
        };

        /* Transient data parts are not added to message state */
        if (dataChunk.transient) {
          return false;
        }

        /* Check if we should update an existing part with same type+id */
        if (dataChunk.id != null) {
          const existingPart = parts.find(
            (p) => p.type === dataChunk.type && (p as any).id === dataChunk.id,
          ) as DataUIPart<any> | undefined;
          if (existingPart) {
            existingPart.data = dataChunk.data;
            return true;
          }
        }

        /* Add new data part */
        parts.push(dataChunk as DataUIPart<any>);
        return true;
      }

      /* Unknown chunk type - ignore */
      return false;
    }
  }
}

/**
 * Result type for fastReadUIMessageStream
 */
export type FastUIMessageStreamResult<UI_MESSAGE extends UIMessage> = {
  chunk: InferUIMessageChunk<UI_MESSAGE>;
  message: UI_MESSAGE | undefined;
};

/**
 * A fast, zero-copy alternative to `readUIMessageStream` from the AI SDK.
 * Yields both the chunk and the assembled message.
 *
 * Key optimizations:
 * - **No `structuredClone`**: Yields the same message reference (mutated in-place)
 * - **No partial JSON parsing**: Tool input deltas are accumulated but not parsed
 * - **Synchronous processing**: No async wrappers for chunk processing
 * - **Single stream layer**: Direct reader loop instead of multiple TransformStreams
 *
 * Returns `message: undefined` for chunks that don't produce message updates:
 * - Meta chunks: start (without content), finish (without metadata), abort, error
 * - Step chunks: start-step, finish-step
 *
 * **Important**: Since this yields a mutable reference, callers should NOT store
 * yielded messages expecting them to retain their state. Each yield represents
 * the current state at that moment. If you need snapshots, clone the message yourself.
 *
 * @example
 * ```typescript
 * for await (const { chunk, message } of fastReadUIMessageStream<MyUIMessage>(stream)) {
 *   console.log(chunk.type);
 *   if (message) {
 *     console.log(message.parts);
 *   }
 * }
 * ```
 */
export async function* fastReadUIMessageStream<UI_MESSAGE extends UIMessage>(
  stream: ReadableStream<InferUIMessageChunk<UI_MESSAGE>>,
): AsyncGenerator<FastUIMessageStreamResult<UI_MESSAGE>> {
  const state = createFastStreamingState<UI_MESSAGE>();
  const reader = stream.getReader();

  try {
    while (true) {
      const { done, value: chunk } = await reader.read();
      if (done) break;

      const shouldYield = processChunkFast(state, chunk);
      yield {
        chunk,
        message: shouldYield ? state.message : undefined,
      };
    }
  } finally {
    reader.releaseLock();
  }
}
