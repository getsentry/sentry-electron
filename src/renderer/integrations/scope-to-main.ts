import { convertIntegrationFnToClass, defineIntegration } from '@sentry/core';
import { normalize } from '@sentry/utils';

import { addScopeListener } from '../../common/scope';
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
      const ipc = getIPC();

      addScopeListener((merged, current, isolated) => {
        ipc.sendScope(JSON.stringify(normalize(merged, 20, 2_000)));
        current.clearBreadcrumbs();
        current.clearAttachments();
        isolated.clearBreadcrumbs();
        isolated.clearAttachments();
      });
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
