import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['kernel/**/*.test.ts', 'bridge/**/*.test.ts', 'background/**/*.test.ts'],
    globals: true,
  },
  define: {
    __DEV__: 'true',
    __VERSION__: '"0.0.0-test"',
  },
  resolve: {
    alias: {
      'kernel': resolve(__dirname, 'kernel'),
    },
  },
});
