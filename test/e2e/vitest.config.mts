import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['./**/*.test.ts'],
    retry: process.env.GITHUB_ACTIONS ? 3 : 0,
    disableConsoleIntercept: true,
    silent: false,
    reporters: process.env.GITHUB_ACTIONS ? ['verbose', 'github-actions'] : ['verbose'],
  },
});
