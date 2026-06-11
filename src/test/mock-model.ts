import type { LanguageModelV3StreamPart } from "@ai-sdk/provider";
import { MockLanguageModel, StreamParts } from "ai-test-kit/language";

type TextToChunksInput =
  | {
      text: string;
      seperator: string;
    }
  | {
      text: string;
      length: number;
    };
export const textToChunks = (input: TextToChunksInput): Array<LanguageModelV3StreamPart> => [
  ...StreamParts.text(
    input.text,
    "seperator" in input ? { separator: input.seperator } : { length: input.length },
  ),
  StreamParts.finish(),
];

type CreateMockModelInput = {
  chunks: Array<LanguageModelV3StreamPart>;
  iniialDelayInMs?: number;
  chunkDelayInMs?: number;
};

export const createMockModel = ({
  chunks,
  iniialDelayInMs = 0,
  chunkDelayInMs = 0,
}: CreateMockModelInput) =>
  MockLanguageModel.from({
    stream: { chunks, initialDelayInMs: iniialDelayInMs, chunkDelayInMs },
  });
