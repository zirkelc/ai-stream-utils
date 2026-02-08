# AGENTS.md - AI Agent Guidelines

## Project Overview

**ai-stream-utils** - A TypeScript library for filtering and transforming AI SDK UI message streams. Provides `filterUIMessageStream`, `mapUIMessageStream`, and `flatMapUIMessageStream`.

## Build/Lint/Test Commands

```bash
pnpm install              # Install dependencies
pnpm build                # Build with tsdown
pnpm test                 # Run all tests
pnpm test -- --watch      # Watch mode
pnpm test -- src/filter-ui-message-stream.test.ts  # Single file
pnpm test -- -t "should filter"                    # Pattern match
pnpm lint                 # Lint and format (auto-fix)
```

## Project Structure

```
src/
├── index.ts                  # Public API exports
├── types.ts                  # Shared type definitions
├── filter-ui-message-stream.ts
├── map-ui-message-stream.ts
├── flat-map-ui-message-stream.ts
├── *.test.ts                 # Test files (co-located)
└── utils/
    └── test-utils.ts         # Test fixtures and types
examples/                     # Usage examples
```

## Code Style Guidelines

### Formatting (Biome + EditorConfig)

- **Indent**: 2 spaces
- **Line endings**: LF
- **Charset**: UTF-8
- **Semicolons**: Always required
- **Quotes**: Single quotes (`'`)
- **Trailing commas**: Always (except JSON)
- **Arrow parentheses**: Always `(x) =>`
- **Final newline**: Required

### TypeScript

- Use `Array<T>` generic syntax instead of `T[]`
- Use `import type { ... }` for type-only imports
- Use `.js` extension in imports (even for `.ts` files): `import { foo } from './foo.js';`
- Prefer explicit type annotations for function parameters and return types
- Use generics with constraints: `<UI_MESSAGE extends UIMessage>`
- Use `Infer` prefix for type inference utilities: `InferUIMessagePart`

### Naming Conventions

- **Files**: kebab-case (`filter-ui-message-stream.ts`)
- **Functions**: camelCase (`filterUIMessageStream`)
- **Types/Interfaces**: PascalCase (`FilterUIMessageStreamPredicate`)
- **Constants**: UPPER_SNAKE_CASE for test fixtures (`START_CHUNK`, `TEXT_CHUNKS`)

### Comments

- Use block comments `/* */` for all comments, including single-line
- Use JSDoc with `@example` blocks for public APIs
- Do NOT use `@param` or `@return` annotations (TypeScript handles types)

````typescript
/**
 * Creates a filter predicate that includes only the specified part types.
 *
 * @example
 * ```typescript
 * filterUIMessageStream(stream, includeParts(['text', 'tool-weather']));
 * ```
 */
export function includeParts<UI_MESSAGE extends UIMessage>(
  includePartTypes: Array<InferUIMessagePartType<UI_MESSAGE>>,
): FilterUIMessageStreamPredicate<UI_MESSAGE> {
  /* ... */
}
````

### Error Handling

- Throw `Error` with descriptive messages for unexpected states
- Use defensive checks with clear error messages:

```typescript
if (!message) {
  throw new Error("Unexpected: received content chunk but message is undefined");
}
```

## Testing

- **Vitest** for testing with co-located test files: `{module}.test.ts`
- Uses `@ai-sdk/provider-utils/test` for stream conversion helpers
- Use `describe`, `it`, `expect` from Vitest
- Prefer inline snapshots with `toMatchInlineSnapshot()`
- Use `describe.each` for parameterized tests
- Check array length with `expect(items.length).toBe(n)` instead of `.toHaveLength(n)`

```typescript
describe("filterUIMessageStream", () => {
  it("should filter chunks using include", async () => {
    /* Arrange */
    const stream = convertArrayToStream([START_CHUNK, ...TEXT_CHUNKS, FINISH_CHUNK]);

    /* Act */
    const filteredStream = filterUIMessageStream<MyUIMessage>(stream, includeParts(["text"]));
    const result = await convertAsyncIterableToArray(filteredStream);

    /* Assert */
    expect(result).toMatchInlineSnapshot(`...`);
  });
});
```

### Async Error Testing

```typescript
const result = fn();
await expect(result).rejects.toThrow();
```

### Test Utilities

Use fixtures from `src/utils/test-utils.ts`:

- `START_CHUNK`, `FINISH_CHUNK`, `ABORT_CHUNK`, `TEXT_CHUNKS`, `REASONING_CHUNKS`
- `MyUIMessage`, `MyUIMessageChunk`, `MyUIMessagePart` types

## Git Workflow

- **Conventional commits**: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`
- Pre-commit hook runs Biome check on staged files
- Releases automated via release-please

## Dependencies

- **Peer dependency**: `ai` (v5.x or v6.x) - Vercel AI SDK
- **Dev**: `vitest`, `biome`, `tsdown`, `tsx`, `zod`, `msw`

## Module System

- ESM only (`"type": "module"`)
- Build output: `dist/index.mjs` with `dist/index.d.mts`
