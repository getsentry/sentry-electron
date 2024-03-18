import { convertIntegrationFnToClass, defineIntegration, getCurrentScope } from '@sentry/core';
import { normalize } from '@sentry/utils';

import { getIPC } from '../ipc';

const INTEGRATION_NAME = 'ScopeToMain';

/**
 * Passes scope changes to the main process.
 */
export const scopeToMainIntegration = defineIntegration(() => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      // noop
    },
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
});

/**
 * Passes scope changes to the main process.
 *
 * @deprecated Use `scopeToMainIntegration()` instead
 */
// eslint-disable-next-line deprecation/deprecation
export const ScopeToMain = convertIntegrationFnToClass(INTEGRATION_NAME, scopeToMainIntegration);
