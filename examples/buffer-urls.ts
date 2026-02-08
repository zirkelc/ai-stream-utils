/**
 * URL Buffering Example
 *
 * Demonstrates how to use mapUIMessageStream to buffer URLs until complete.
 * Prevents partial URLs from being streamed to the UI.
 *
 * Without buffering, a URL might stream character-by-character:
 *   "http" -> "://" -> "example" -> ".com"
 *
 * With buffering, the complete URL is emitted at once:
 *   "http://example.com "
 */

import type { AsyncIterableStream, UIMessage, UIMessageChunk } from "ai";
import { convertArrayToStream } from "ai/test";
import { type MapUIMessageStreamFn, mapUIMessageStream } from "../src/index.js";

/**
 * Configuration for a buffering pattern.
 */
type BufferPattern = {
  /* Regex that triggers buffering when matched */
  start: RegExp;
  /* Regex that signals the buffered content is complete */
  end: RegExp;
  /* Optional function to transform the matched content */
  replace?: (match: string) => string;
};

/**
 * Buffers text in a UI message stream based on configurable patterns.
 *
 * When a `start` pattern is detected, text is buffered until the corresponding
 * `end` pattern is found.
 * ```
 */
function bufferPatternsUIMessageStream(
  stream: ReadableStream<UIMessageChunk>,
  patterns: Array<BufferPattern>,
): AsyncIterableStream<UIMessageChunk> {
  let buffer = ``;
  let currentId = ``;
  let activePattern: BufferPattern | null = null;

  /**
   * Flushes the buffer without applying replacer (used for incomplete patterns).
   */
  const flushBuffer = (id: string): UIMessageChunk | null => {
    if (buffer.length === 0) {
      return null;
    }

    const text = buffer;
    buffer = ``;
    activePattern = null;

    return { type: `text-delta`, id, delta: text };
  };

  /**
   * Processes the buffer, emitting completed patterns and non-pattern text.
   * Returns an array of chunks to emit.
   */
  const processBuffer = (): Array<UIMessageChunk> => {
    const chunks: Array<UIMessageChunk> = [];

    while (buffer.length > 0) {
      if (activePattern === null) {
        /* Not currently buffering - check if any pattern starts */
        let earliestMatch: {
          index: number;
          length: number;
          pattern: BufferPattern;
        } | null = null;

        for (const pattern of patterns) {
          const match = pattern.start.exec(buffer);
          if (match && (earliestMatch === null || match.index < earliestMatch.index)) {
            earliestMatch = {
              index: match.index,
              length: match[0].length,
              pattern,
            };
          }
        }

        if (earliestMatch) {
          /* Emit text before the pattern AND the matched start pattern itself */
          const textBeforeAndMatch = buffer.slice(0, earliestMatch.index + earliestMatch.length);
          if (textBeforeAndMatch.length > 0) {
            chunks.push({
              type: `text-delta`,
              id: currentId,
              delta: textBeforeAndMatch,
            });
          }
          buffer = buffer.slice(earliestMatch.index + earliestMatch.length);

          /* Start buffering this pattern */
          activePattern = earliestMatch.pattern;
        } else {
          /* No pattern found - emit entire buffer */
          chunks.push({ type: `text-delta`, id: currentId, delta: buffer });
          buffer = ``;
        }
      } else {
        /* Currently buffering - check if pattern ends */
        const endMatch = activePattern.end.exec(buffer);

        if (endMatch) {
          /* Pattern complete - extract matched portion */
          const matchedText = buffer.slice(0, endMatch.index);
          const delimiter = endMatch[0];

          /* Apply replacer if defined */
          const transformedText = activePattern.replace
            ? activePattern.replace(matchedText)
            : matchedText;

          /* Emit the buffered content */
          if (transformedText.length > 0) {
            chunks.push({
              type: `text-delta`,
              id: currentId,
              delta: transformedText,
            });
          }

          /* Emit the delimiter separately */
          chunks.push({
            type: `text-delta`,
            id: currentId,
            delta: delimiter,
          });

          /* Continue with remaining text */
          buffer = buffer.slice(endMatch.index + delimiter.length);
          activePattern = null;
        } else {
          /* Pattern not complete yet - keep buffering */
          break;
        }
      }
    }

    return chunks;
  };

  const bufferMap: MapUIMessageStreamFn<UIMessage> = ({ chunk }) => {
    /* Non-text-delta chunks: flush buffer and pass through */
    if (chunk.type !== `text-delta`) {
      const flushed = flushBuffer(currentId);
      if (flushed) {
        return [flushed, chunk];
      }
      return chunk;
    }

    /* Handle ID change: flush old buffer first */
    if (chunk.id !== currentId) {
      const flushed = flushBuffer(currentId);
      currentId = chunk.id;
      buffer = chunk.delta;
      const result = processBuffer();
      return flushed ? [flushed, ...result] : result;
    }

    /* Accumulate text and process */
    buffer += chunk.delta;

    return processBuffer();
  };

  return mapUIMessageStream(stream, bufferMap);
}

/* Pattern: URLs inside markdown links [title]](url) */
const MARKDOWN_URL_PATTERN: BufferPattern = {
  start: /\]\(/, // Chunks containing "](" starts buffering
  end: /\)/, // Chunks containing ")" ends buffering
  // replace: (url) => `https://example.com`, // Example replacer
};

/* LIVE STREAM */
// const result = streamText({
//   model: openai(`gpt-4o`),
//   prompt: `Give me 3 useful programming resources. Include the full URLs.`,
// });

/* TEST INPUT STREAM */
const uiStream = convertArrayToStream([
  { type: "start" },
  { type: "start-step" },
  {
    type: "text-start",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    providerMetadata: {
      openai: {
        itemId: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
      },
    },
  },
  {
    type: "text-delta",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    delta: "Certainly",
  },
  {
    type: "text-delta",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    delta: "!",
  },
  {
    type: "text-delta",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    delta: " Here",
  },
  {
    type: "text-delta",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    delta: " are",
  },
  {
    type: "text-delta",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    delta: " three",
  },
  {
    type: "text-delta",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    delta: " useful",
  },
  {
    type: "text-delta",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    delta: " programming",
  },
  {
    type: "text-delta",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    delta: " resources",
  },
  {
    type: "text-delta",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    delta: ":\n\n",
  },
  {
    type: "text-delta",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    delta: "1",
  },
  {
    type: "text-delta",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    delta: ".",
  },
  {
    type: "text-delta",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    delta: " **",
  },
  {
    type: "text-delta",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    delta: "Stack",
  },
  {
    type: "text-delta",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    delta: " Overflow",
  },
  {
    type: "text-delta",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    delta: "**",
  },
  {
    type: "text-delta",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    delta: "  \n",
  },
  {
    type: "text-delta",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    delta: "  ",
  },
  {
    type: "text-delta",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    delta: " A",
  },
  {
    type: "text-delta",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    delta: " community",
  },
  {
    type: "text-delta",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    delta: "-driven",
  },
  {
    type: "text-delta",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    delta: " Q",
  },
  {
    type: "text-delta",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    delta: "&A",
  },
  {
    type: "text-delta",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    delta: " site",
  },
  {
    type: "text-delta",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    delta: " for",
  },
  {
    type: "text-delta",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    delta: " all",
  },
  {
    type: "text-delta",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    delta: " your",
  },
  {
    type: "text-delta",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    delta: " programming",
  },
  {
    type: "text-delta",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    delta: " questions",
  },
  {
    type: "text-delta",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    delta: ".\n",
  },
  {
    type: "text-delta",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    delta: "  ",
  },
  {
    type: "text-delta",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    delta: " [Stack",
  },
  {
    type: "text-delta",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    delta: " Overflow",
  },
  {
    type: "text-delta",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    delta: "](",
  },
  {
    type: "text-delta",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    delta: "https",
  },
  {
    type: "text-delta",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    delta: "://",
  },
  {
    type: "text-delta",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    delta: "stackoverflow",
  },
  {
    type: "text-delta",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    delta: ".com",
  },
  {
    type: "text-delta",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    delta: ")\n\n",
  },
  {
    type: "text-delta",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    delta: "2",
  },
  {
    type: "text-delta",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    delta: ".",
  },
  {
    type: "text-delta",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    delta: " **",
  },
  {
    type: "text-delta",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    delta: "Git",
  },
  {
    type: "text-delta",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    delta: "Hub",
  },
  {
    type: "text-delta",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    delta: "**",
  },
  {
    type: "text-delta",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    delta: "  \n",
  },
  {
    type: "text-delta",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    delta: "  ",
  },
  {
    type: "text-delta",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    delta: " A",
  },
  {
    type: "text-delta",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    delta: " platform",
  },
  {
    type: "text-delta",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    delta: " for",
  },
  {
    type: "text-delta",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    delta: " version",
  },
  {
    type: "text-delta",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    delta: " control",
  },
  {
    type: "text-delta",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    delta: " and",
  },
  {
    type: "text-delta",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    delta: " collaboration",
  },
  {
    type: "text-delta",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    delta: ".",
  },
  {
    type: "text-delta",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    delta: " Host",
  },
  {
    type: "text-delta",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    delta: " and",
  },
  {
    type: "text-delta",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    delta: " review",
  },
  {
    type: "text-delta",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    delta: " code",
  },
  {
    type: "text-delta",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    delta: ",",
  },
  {
    type: "text-delta",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    delta: " manage",
  },
  {
    type: "text-delta",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    delta: " projects",
  },
  {
    type: "text-delta",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    delta: ",",
  },
  {
    type: "text-delta",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    delta: " and",
  },
  {
    type: "text-delta",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    delta: " build",
  },
  {
    type: "text-delta",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    delta: " software",
  },
  {
    type: "text-delta",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    delta: ".\n",
  },
  {
    type: "text-delta",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    delta: "  ",
  },
  {
    type: "text-delta",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    delta: " [Git",
  },
  {
    type: "text-delta",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    delta: "Hub",
  },
  {
    type: "text-delta",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    delta: "](",
  },
  {
    type: "text-delta",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    delta: "https",
  },
  {
    type: "text-delta",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    delta: "://",
  },
  {
    type: "text-delta",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    delta: "github",
  },
  {
    type: "text-delta",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    delta: ".com",
  },
  {
    type: "text-delta",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    delta: ")\n\n",
  },
  {
    type: "text-delta",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    delta: "3",
  },
  {
    type: "text-delta",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    delta: ".",
  },
  {
    type: "text-delta",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    delta: " **",
  },
  {
    type: "text-delta",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    delta: "free",
  },
  {
    type: "text-delta",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    delta: "Code",
  },
  {
    type: "text-delta",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    delta: "Camp",
  },
  {
    type: "text-delta",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    delta: "**",
  },
  {
    type: "text-delta",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    delta: "  \n",
  },
  {
    type: "text-delta",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    delta: "  ",
  },
  {
    type: "text-delta",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    delta: " An",
  },
  {
    type: "text-delta",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    delta: " interactive",
  },
  {
    type: "text-delta",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    delta: " learning",
  },
  {
    type: "text-delta",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    delta: " platform",
  },
  {
    type: "text-delta",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    delta: " offering",
  },
  {
    type: "text-delta",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    delta: " free",
  },
  {
    type: "text-delta",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    delta: " coding",
  },
  {
    type: "text-delta",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    delta: " tutorials",
  },
  {
    type: "text-delta",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    delta: " and",
  },
  {
    type: "text-delta",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    delta: " projects",
  },
  {
    type: "text-delta",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    delta: ".\n",
  },
  {
    type: "text-delta",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    delta: "  ",
  },
  {
    type: "text-delta",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    delta: " [free",
  },
  {
    type: "text-delta",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    delta: "Code",
  },
  {
    type: "text-delta",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    delta: "Camp",
  },
  {
    type: "text-delta",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    delta: "](",
  },
  {
    type: "text-delta",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    delta: "https",
  },
  {
    type: "text-delta",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    delta: "://",
  },
  {
    type: "text-delta",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    delta: "www",
  },
  {
    type: "text-delta",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    delta: ".free",
  },
  {
    type: "text-delta",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    delta: "code",
  },
  {
    type: "text-delta",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    delta: "camp",
  },
  {
    type: "text-delta",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    delta: ".org",
  },
  {
    type: "text-delta",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    delta: ")",
  },
  {
    type: "text-end",
    id: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
    providerMetadata: {
      openai: {
        itemId: "msg_01b7529850cea5b300695b92eee1f88195a721bbeb5fe56cbb",
      },
    },
  },
  { type: "finish-step" },
  { type: "finish", finishReason: "stop" },
]) as ReadableStream<UIMessageChunk>;

const bufferedStream = bufferPatternsUIMessageStream(uiStream, [MARKDOWN_URL_PATTERN]);

for await (const chunk of bufferedStream) {
  console.log(chunk);
}

/*
 * Example output (URLs are emitted as complete strings):
 *
 * { type: 'start' }
 * { type: 'start-step', ... }
 * { type: 'text-start', }
 * { type: 'text-delta', delta: '1. ' }
 * { type: 'text-delta', delta: '[MDN' }
 * { type: 'text-delta', delta: ' Web' }
 * { type: 'text-delta', delta: ' Docs' }
 * { type: 'text-delta', delta: '](' }
 * { type: 'text-delta', delta: 'https://developer.mozilla.org' } # Complete URL
 * { type: 'text-delta', delta: ')' }
 * { type: 'text-delta', delta: '\n' }
 * { type: 'text-delta', delta: '2. ' }
 * { type: 'text-delta', delta: '[Stack ' }
 * { type: 'text-delta', delta: ' Overflow' }
 * { type: 'text-delta', delta: '](' }
 * { type: 'text-delta', delta: 'https://stackoverflow.com' } # Complete URL
 * { type: 'text-delta', delta: ')' }
 * { type: 'text-delta', delta: '\n' }
 * ...
 * { type: 'text-end', }
 * { type: 'finish-step', ... }
 * { type: 'finish', ... }
 */
