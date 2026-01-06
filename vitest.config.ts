import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    typecheck: {
      enabled: true,
    },
    benchmark: {
      outputJson: './benchmarks/benchmark-results.json',
      compare: './benchmarks/benchmark-results.json',
    },
  },
});
