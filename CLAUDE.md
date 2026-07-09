# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

`ai-stream-utils` is a TypeScript library that provides composable filter and transformation utilities for UI message streams created by `streamText()` in the AI SDK (v7). The main export is the `pipe()` function that creates a fluent pipeline API.

## Commands

```bash
pnpm build          # Build with tsdown
pnpm test           # Run tests with vitest (includes type tests)
pnpm test -- --run  # Run tests once (no watch)
pnpm benchmark      # Run benchmarks
pnpm lint           # Lint with oxlint
pnpm format         # Format with oxfmt
```

Run a single test file:

```bash
pnpm test src/pipe/pipe.test.ts
```

## Architecture

### Core Pipeline (`src/pipe/`)

The `pipe()` function wraps a `ReadableStream<UIMessageChunk>` and returns a `ChunkPipeline` with chainable operators:

- **`pipe.ts`**: Entry point - creates internal iterable with part type tracking via `ToolPartTypeMap`
- **`chunk-pipeline.ts`**: Fluent builder class with `.filter()`, `.map()`, `.on()`, `.toStream()` operators
- **`type-guards.ts`**: Type guard factory functions (`includeChunks`, `includeParts`, `excludeChunks`, `excludeParts`, `chunkType`) that enable TypeScript type narrowing after filtering
- **`types.ts`**: Core type definitions including `FilterGuard`, `ObserveGuard`, `ChunkInput`, branded types

Meta chunks (start, finish, abort, error, message-metadata) always pass through filters unchanged.

### Stream Utilities (`src/utils/`)

Helpers for stream/array/iterable conversions and SSE encoding/decoding.

### Internal (`src/internal/`)

- **`get-part-type-from-chunk.ts`**: Maps chunk types to part types, tracking tool call ids and approval ids
- **`utils.ts`**: Chunk classification helpers shared by the pipeline

### Test Infrastructure (`src/test/`)

- **`ui-message.ts`**: Test `UIMessage` type plus chunk/part fixtures built with `ai-test-kit`

## Type System

The library uses advanced TypeScript patterns:

1. **Branded types**: `FilterGuard` and `ObserveGuard` have `__brand` properties to distinguish them from plain predicates
2. **Type narrowing**: After `.filter(includeParts('text'))`, subsequent `.map()` receives narrowed chunk/part types
3. **Generic UIMessage**: Pass your `UIMessage` type as generic parameter to `pipe<MyUIMessage>()` for full type safety

## Testing

- Unit tests: `*.test.ts`
- Type tests: `*.test-d.ts` (vitest typecheck)
- Benchmarks: `*.bench.ts`
