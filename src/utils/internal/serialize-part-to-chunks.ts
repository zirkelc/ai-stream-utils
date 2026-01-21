import type {
  InferUIMessageChunk,
  SourceDocumentUIPart,
  SourceUrlUIPart,
  StepStartUIPart,
  UIDataTypes,
  UIMessage,
  UIMessagePart,
  UITools,
} from 'ai';
import {
  getToolOrDynamicToolName,
  isDataUIPart,
  isFileUIPart,
  isReasoningUIPart,
  isTextUIPart,
  isToolOrDynamicToolUIPart,
} from 'ai';
import type { InferUIMessagePart } from '../../types.js';

/**
 * Type guard to check if a message part is a source-url part.
 */
function isSourceUrlUIPart(
  part: UIMessagePart<UIDataTypes, UITools>,
): part is SourceUrlUIPart {
  return part.type === 'source-url';
}

/**
 * Type guard to check if a message part is a source-document part.
 */
function isSourceDocumentUIPart(
  part: UIMessagePart<UIDataTypes, UITools>,
): part is SourceDocumentUIPart {
  return part.type === 'source-document';
}

/**
 * Type guard to check if a message part is a step-start part.
 */
function isStepStartUIPart(
  part: UIMessagePart<UIDataTypes, UITools>,
): part is StepStartUIPart {
  return part.type === 'step-start';
}

/**
 * Extracts the part ID from a list of chunks belonging to the same part.
 */
function getPartId<UI_MESSAGE extends UIMessage>(
  chunks: InferUIMessageChunk<UI_MESSAGE>[],
): string {
  for (const chunk of chunks) {
    if ('id' in chunk && chunk.id) return chunk.id;
    if ('toolCallId' in chunk && chunk.toolCallId) return chunk.toolCallId;
  }
  return 'unknown';
}

/**
 * Serializes a UIMessagePart back to chunks (without step boundaries).
 *
 * This function converts a complete part (e.g., TextUIPart, ToolUIPart)
 * back into the chunk format used by UIMessageStream.
 *
 * @param part - The part to serialize
 * @param originalChunks - Original chunks for extracting IDs (for text/reasoning parts)
 * @returns Array of chunks representing the part
 */
export function serializePartToChunks<UI_MESSAGE extends UIMessage>(
  part: InferUIMessagePart<UI_MESSAGE>,
  originalChunks: InferUIMessageChunk<UI_MESSAGE>[],
): InferUIMessageChunk<UI_MESSAGE>[] {
  // Handle step-start parts (v6+)
  if (isStepStartUIPart(part)) {
    return originalChunks;
  }

  if (isFileUIPart(part)) {
    return [
      {
        type: 'file',
        mediaType: part.mediaType,
        url: part.url,
        providerMetadata: part.providerMetadata,
      } as InferUIMessageChunk<UI_MESSAGE>,
    ];
  }

  if (isSourceUrlUIPart(part)) {
    return [
      {
        type: 'source-url',
        sourceId: part.sourceId,
        url: part.url,
        title: part.title,
        providerMetadata: part.providerMetadata,
      } as InferUIMessageChunk<UI_MESSAGE>,
    ];
  }

  if (isSourceDocumentUIPart(part)) {
    return [
      {
        type: 'source-document',
        sourceId: part.sourceId,
        mediaType: part.mediaType,
        title: part.title,
        filename: part.filename,
        providerMetadata: part.providerMetadata,
      } as InferUIMessageChunk<UI_MESSAGE>,
    ];
  }

  if (isDataUIPart(part)) {
    return [
      { type: part.type, data: part.data } as InferUIMessageChunk<UI_MESSAGE>,
    ];
  }

  const id = getPartId(originalChunks);

  if (isTextUIPart(part)) {
    return [
      { type: 'text-start', id, providerMetadata: part.providerMetadata },
      { type: 'text-delta', id, delta: part.text },
      { type: 'text-end', id, providerMetadata: part.providerMetadata },
    ] as InferUIMessageChunk<UI_MESSAGE>[];
  }

  if (isReasoningUIPart(part)) {
    return [
      {
        type: 'reasoning-start',
        id,
        providerMetadata: part.providerMetadata,
      },
      { type: 'reasoning-delta', id, delta: part.text },
      {
        type: 'reasoning-end',
        id,
        providerMetadata: part.providerMetadata,
      },
    ] as InferUIMessageChunk<UI_MESSAGE>[];
  }

  if (isToolOrDynamicToolUIPart(part)) {
    const dynamic = (part.type as string) === 'dynamic-tool';

    const chunks: InferUIMessageChunk<UI_MESSAGE>[] = [
      {
        type: 'tool-input-start',
        toolCallId: part.toolCallId,
        toolName: getToolOrDynamicToolName(part),
        dynamic,
        providerExecuted: part.providerExecuted,
      } as InferUIMessageChunk<UI_MESSAGE>,
    ];

    if (part.state === 'input-available' || part.state === 'output-available') {
      chunks.push({
        type: 'tool-input-available',
        toolCallId: part.toolCallId,
        toolName: getToolOrDynamicToolName(part),
        input: part.input,
        dynamic,
        providerExecuted: part.providerExecuted,
        providerMetadata: part.callProviderMetadata,
      } as InferUIMessageChunk<UI_MESSAGE>);
    }

    if (part.state === 'output-available') {
      chunks.push({
        type: 'tool-output-available',
        toolCallId: part.toolCallId,
        output: part.output,
        dynamic,
        providerExecuted: part.providerExecuted,
        preliminary: part.preliminary,
      } as InferUIMessageChunk<UI_MESSAGE>);
    } else if (part.state === 'output-error') {
      chunks.push({
        type: 'tool-output-error',
        toolCallId: part.toolCallId,
        errorText: part.errorText,
        dynamic,
        providerExecuted: part.providerExecuted,
      } as InferUIMessageChunk<UI_MESSAGE>);
    }

    return chunks;
  }

  return originalChunks;
}
