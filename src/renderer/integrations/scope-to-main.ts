import { getCurrentHub } from '@sentry/core';
import { Integration } from '@sentry/types';

import { walk } from '../../common';
import { getIPC } from '../ipc';

/**
 * Passes scope changes to the main process.
 */
export class ScopeToMain implements Integration {
  /** @inheritDoc */
  public static id: string = 'ScopeToMain';

  /** @inheritDoc */
  public name: string = ScopeToMain.id;

  /** @inheritDoc */
  public setupOnce(): void {
    this._setupScopeListener();
  }

  /**
   * Sends the scope to the main process when it updates.
   */
  private _setupScopeListener(): void {
    const ipc = getIPC();

    const scope = getCurrentHub().getScope();
    if (scope) {
      scope.addScopeListener((updatedScope) => {
        ipc.sendScope(JSON.stringify(updatedScope, walk));
        scope.clearBreadcrumbs();
      });
    }
  }
}
