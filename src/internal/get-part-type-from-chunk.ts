import type { InferUIMessageChunk, UIMessage } from "ai";

/**
 * Tracks the part type a tool chunk belongs to.
 *
 * Only `tool-input-start` carries the `toolName` and `dynamic` flag, so the part
 * type has to be remembered and looked up again for every later chunk of the
 * same tool call. Approval responses identify the call by `approvalId` instead
 * of `toolCallId`, so the id seen on the approval request is indexed as well.
 */
export type ToolPartTypeMap = {
  byToolCallId: Map<string, string>;
  byApprovalId: Map<string, string>;
};

/**
 * Creates an empty map for tracking tool part types across a single stream.
 */
export function createToolPartTypeMap(): ToolPartTypeMap {
  return { byToolCallId: new Map(), byApprovalId: new Map() };
}

/**
 * Derives the part type directly from a chunk's type.
 * This avoids relying on `message.parts[-1]` which can be incorrect
 * when chunks from different part types are interleaved.
 *
 * @param chunk - The chunk to derive part type from
 * @param toolPartTypes - Map to track tool call/approval ids → partType
 * @returns The part type string, or undefined for meta chunks
 */
export function getPartTypeFromChunk<UI_MESSAGE extends UIMessage>(
  chunk: InferUIMessageChunk<UI_MESSAGE>,
  toolPartTypes: ToolPartTypeMap,
): string | undefined {
  const chunkType = chunk.type;

  switch (chunkType) {
    /** Text chunks → 'text' part */
    case `text-start`:
    case `text-delta`:
    case `text-end`:
      return `text`;

    /** Reasoning chunks → 'reasoning' part */
    case `reasoning-start`:
    case `reasoning-delta`:
    case `reasoning-end`:
      return `reasoning`;

    /** Files produced inside a reasoning trace are their own part, not `reasoning` */
    case `reasoning-file`:
      return `reasoning-file`;

    /** Provider-specific content → 'custom' part */
    case `custom`:
      return `custom`;

    /** Tool input start - has toolName and dynamic flag */
    case `tool-input-start`: {
      const c = chunk as {
        toolCallId: string;
        toolName: string;
        dynamic?: boolean;
      };
      const partType = c.dynamic ? `dynamic-tool` : `tool-${c.toolName}`;
      toolPartTypes.byToolCallId.set(c.toolCallId, partType);
      return partType;
    }

    /** Approval request carries both ids, so the approvalId can be indexed here */
    case `tool-approval-request`: {
      const c = chunk as { toolCallId: string; approvalId: string };
      const partType = toolPartTypes.byToolCallId.get(c.toolCallId);
      if (partType !== undefined) {
        toolPartTypes.byApprovalId.set(c.approvalId, partType);
      }
      return partType;
    }

    /** Approval response only references the approvalId */
    case `tool-approval-response`: {
      const c = chunk as { approvalId: string };
      return toolPartTypes.byApprovalId.get(c.approvalId);
    }

    /** Tool chunks with toolCallId only - lookup from map */
    case `tool-input-delta`:
    case `tool-input-available`:
    case `tool-input-error`:
    case `tool-output-available`:
    case `tool-output-error`:
    case `tool-output-denied`: {
      const c = chunk as { toolCallId: string };
      return toolPartTypes.byToolCallId.get(c.toolCallId);
    }

    /** Source chunks */
    case `source-url`:
      return `source-url`;
    case `source-document`:
      return `source-document`;

    /** File chunk */
    case `file`:
      return `file`;

    /** Meta chunks - return undefined */
    case `start`:
    case `finish`:
    case `start-step`:
    case `finish-step`:
    case `error`:
    case `abort`:
    case `message-metadata`:
      return undefined;

    /** Data chunks (data-*) and any other custom chunks */
    default:
      if (chunkType.startsWith(`data-`)) {
        return chunkType;
      }
  }

  throw new Error(`Unable to derive part type from chunk type: ${chunkType}`);
}
