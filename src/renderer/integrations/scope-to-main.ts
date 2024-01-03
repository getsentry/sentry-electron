import { convertIntegrationFnToClass, getCurrentScope } from '@sentry/core';
import { IntegrationFn } from '@sentry/types';
import { normalize } from '@sentry/utils';

import { getIPC } from '../ipc';

const INTEGRATION_NAME = 'ScopeToMain';

const scopeToMain: IntegrationFn = () => {
  return {
    name: INTEGRATION_NAME,
    setup() {
      const scope = getCurrentScope();
      if (scope) {
        const ipc = getIPC();

        scope.addScopeListener((updatedScope) => {
          ipc.sendScope(JSON.stringify(normalize(updatedScope.getScopeData(), 20, 2_000)));
          scope.clearBreadcrumbs();
          scope.clearAttachments();
        });
      }
    },
  };
};

/**
 * Passes scope changes to the main process.
 */
// eslint-disable-next-line deprecation/deprecation
export const ScopeToMain = convertIntegrationFnToClass(INTEGRATION_NAME, scopeToMain);
