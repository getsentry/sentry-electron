import { defineIntegration } from '@sentry/core';
import { normalize } from '@sentry/utils';

import { addScopeListener } from '../../common/scope';
import { getIPC } from '../ipc';

/**
 * Passes scope changes to the main process.
 */
export const scopeToMainIntegration = defineIntegration(() => {
  return {
    name: 'ScopeToMain',
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
