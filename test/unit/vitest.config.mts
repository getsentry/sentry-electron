import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['./**/*.test.ts'],
    reporters: process.env.GITHUB_ACTIONS ? ['verbose', 'github-actions'] : ['verbose'],
  },
});
