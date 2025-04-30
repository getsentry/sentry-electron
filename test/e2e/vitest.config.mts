import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['./**/*test.ts', '../../examples/**/*test.ts'],
    minWorkers: 1,
    maxWorkers: 1,
    // retry: process.env.CI ? 3 : 0,
    disableConsoleIntercept: true,
    silent: false,
    pool: 'threads',
    reporters: process.env.DEBUG
      ? ['default', { summary: false }]
      : ['verbose'],
  },
});
