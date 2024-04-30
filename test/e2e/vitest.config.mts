import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['./**/*.test.ts'],
    retry: process.env.CI ? 3 : 0,
    disableConsoleIntercept: true,
    silent: false,
    reporters: process.env.CI || process.env.DEBUG ? ['verbose', 'github-actions'] : ['verbose'],
  },
});
