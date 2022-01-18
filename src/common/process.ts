/** Checks that code is running in the correct process */
export function ensureProcess(expected: 'main' | 'renderer'): void {
  // eslint-disable-next-line no-restricted-globals
  const current = typeof window !== 'undefined' ? 'renderer' : 'main';

  if (current !== expected) {
    throw new Error(`This code is intended to run in the Electron ${expected} process but is currently running in the ${current} process.
This can occur if a bundler picks the wrong entry point.

You can work around this by using a relative import:
import * as Sentry from '@sentry/electron/${current}';`);
  }
}
