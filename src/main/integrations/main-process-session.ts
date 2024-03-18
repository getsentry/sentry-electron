import { convertIntegrationFnToClass, defineIntegration } from '@sentry/core';

import { endSessionOnExit, startSession } from '../sessions';

export interface Options {
  /**
   * Whether sessions should be sent immediately on creation
   *
   * @default false
   */
  sendOnCreate?: boolean;
}

const INTEGRATION_NAME = 'MainProcessSession';

/** Tracks sessions as the main process lifetime. */
export const mainProcessSessionIntegration = defineIntegration((options: Options = {}) => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      // noop
    },
    setup() {
      startSession(!!options.sendOnCreate);
      endSessionOnExit();
    },
  };
});

/**
 * Tracks sessions as the main process lifetime.
 *
 * @deprecated Use `mainProcessSessionIntegration()` instead
 */
// eslint-disable-next-line deprecation/deprecation
export const MainProcessSession = convertIntegrationFnToClass(INTEGRATION_NAME, mainProcessSessionIntegration);
