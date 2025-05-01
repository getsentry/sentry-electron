import { defineIntegration } from '@sentry/core';
import { endSessionOnExit, startSession } from '../sessions';

export interface Options {
  /**
   * Whether sessions should be sent immediately on creation
   *
   * @default false
   */
  sendOnCreate?: boolean;
}

/** Tracks sessions as the main process lifetime. */
export const mainProcessSessionIntegration = defineIntegration((options: Options = {}) => {
  return {
    name: 'MainProcessSession',
    setup() {
      startSession(!!options.sendOnCreate);
      endSessionOnExit();
    },
  };
});
