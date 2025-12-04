import {
  type InferUIMessageChunk,
  readUIMessageStream,
  type UIMessage,
} from 'ai';
import { convertArrayToReadableStream } from 'ai/test';
import {
  flatMapUIMessageStream,
  partTypeIs,
} from '../src/flat-map-ui-message-stream.js';

type MyUIMessage = UIMessage;
type MyUIMessageChunk = InferUIMessageChunk<MyUIMessage>;

const START_CHUNK: MyUIMessageChunk = { type: 'start' };
const FINISH_CHUNK: MyUIMessageChunk = { type: 'finish' };

const REASONING_CHUNKS: MyUIMessageChunk[] = [
  { type: 'start-step' },
  { type: 'reasoning-start', id: '2' },
  { type: 'reasoning-delta', id: '2', delta: 'Thinking...' },
  { type: 'reasoning-delta', id: '2', delta: 'Reasoning...' },
  { type: 'reasoning-end', id: '2' },
  { type: 'finish-step' },
];

const TEXT_CHUNKS: MyUIMessageChunk[] = [
  { type: 'start-step' },
  { type: 'text-start', id: '1' },
  { type: 'text-delta', id: '1', delta: 'Hello' },
  { type: 'text-delta', id: '1', delta: ' World' },
  { type: 'text-end', id: '1' },
  { type: 'finish-step' },
];

const stream = convertArrayToReadableStream([
  START_CHUNK,
  ...REASONING_CHUNKS,
  ...TEXT_CHUNKS,
  FINISH_CHUNK,
]);
for await (const message of readUIMessageStream({
  stream: stream,
})) {
  console.log(message);
}
