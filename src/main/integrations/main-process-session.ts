import { convertIntegrationFnToClass } from '@sentry/core';
import { IntegrationFn } from '@sentry/types';

import { endSessionOnExit, startSession } from '../sessions';

interface Options {
  /**
   * Whether sessions should be sent immediately on creation
   *
   * @default false
   */
  sendOnCreate?: boolean;
}

const INTEGRATION_NAME = 'MainProcessSession';

const mainProcessSession: IntegrationFn = (options: Options = {}) => {
  return {
    name: INTEGRATION_NAME,
    setup() {
      startSession(!!options.sendOnCreate);
      endSessionOnExit();
    },
  };
};

/** Tracks sessions as the main process lifetime. */
// eslint-disable-next-line deprecation/deprecation
export const MainProcessSession = convertIntegrationFnToClass(INTEGRATION_NAME, mainProcessSession);
