import type { LanguageModelV3StreamPart } from "@ai-sdk/provider";
import { simulateReadableStream } from "ai";
import { MockLanguageModelV3 } from "ai/test";

type TextToChunksInput =
  | {
      text: string;
      seperator: string;
    }
  | {
      text: string;
      length: number;
    };
export const textToChunks = (input: TextToChunksInput): Array<LanguageModelV3StreamPart> => {
  const tokens =
    "seperator" in input
      ? input.text.split(input.seperator).map((s) => s + input.seperator)
      : input.text.split(new RegExp(`(.{1,${input.length}})`)).filter((s) => s.length > 0);
  const textId = "1";

  const chunks: Array<LanguageModelV3StreamPart> = [
    { type: `text-start`, id: textId },
    ...tokens.map(
      (token) =>
        ({
          type: `text-delta`,
          id: textId,
          delta: `${token}`,
        }) as const,
    ),
    { type: `text-end`, id: textId },
    {
      type: `finish`,
      finishReason: { unified: "stop", raw: "stop" },
      usage: {
        inputTokens: {
          total: tokens.length,
          cacheRead: 0,
          cacheWrite: 0,
          noCache: 0,
        },
        outputTokens: {
          total: tokens.length,
          text: tokens.length,
          reasoning: 0,
        },
      },
    },
  ];

  return chunks;
};

type CreateMockModelInput = {
  chunks: Array<LanguageModelV3StreamPart>;
  iniialDelayInMs?: number;
  chunkDelayInMs?: number;
};

export const createMockModel = ({
  chunks,
  iniialDelayInMs = 0,
  chunkDelayInMs = 0,
}: CreateMockModelInput) => {
  const model = new MockLanguageModelV3({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks,
        initialDelayInMs: iniialDelayInMs,
        chunkDelayInMs: chunkDelayInMs,
      }),
    }),
  });

  return model;
};
