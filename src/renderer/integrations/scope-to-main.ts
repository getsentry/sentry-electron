import { defineIntegration, normalize } from '@sentry/core';
import { addScopeListener } from '../../common/scope.js';
import { getIPC } from '../ipc.js';

/**
 * Passes scope changes to the main process.
 */
export const scopeToMainIntegration = defineIntegration(() => {
  return {
    name: 'ScopeToMain',
    setup(client) {
      const ipc = getIPC(client);

      addScopeListener((merged, changed) => {
        ipc.sendScope(JSON.stringify(normalize(merged, 20, 2_000)));
        changed.clearBreadcrumbs();
        changed.clearAttachments();
      });
    },
  };
});
