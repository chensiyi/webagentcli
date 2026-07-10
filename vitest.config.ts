import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['kernel/**/*.test.ts', 'bridge/**/*.test.ts', 'background/**/*.test.ts'],
    globals: true,
  },
  resolve: {
    alias: {
      'kernel': resolve(__dirname, 'kernel'),
    },
  },
});
