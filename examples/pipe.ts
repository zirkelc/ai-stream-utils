import { openai } from "@ai-sdk/openai";
import { streamText } from "ai";
import { excludeParts, pipe as fromStream, includeParts } from "ai-stream-utils";

const result = streamText({
  model: openai("gpt-5"),
  prompt: "Tell me a joke.",
});

const stream = fromStream(result.toUIMessageStream())
  .filter(includeParts(["text", "reasoning"])) // Filter narrows type to TextUIPart | ReasoningUIPart
  .filter(excludeParts(["reasoning"])) // Filter narrows type to TextUIPart
  .map(({ chunk, part }) => {
    // Part is typed as TextUIPart
    // Chunk is typed as 'text-start' | 'text-delta' | 'text-end'
    if (chunk.type === "text-delta") {
      return { ...chunk, delta: chunk.delta.toUpperCase() };
    }

    return chunk;
  })
  .toStream();

for await (const chunk of stream) {
  console.log(chunk);
}
