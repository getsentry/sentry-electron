import { defineIntegration, normalize } from '@sentry/core';

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

      addScopeListener((merged, changed) => {
        ipc.sendScope(JSON.stringify(normalize(merged, 20, 2_000)));
        changed.clearBreadcrumbs();
        changed.clearAttachments();
      });
    },
  };
});
