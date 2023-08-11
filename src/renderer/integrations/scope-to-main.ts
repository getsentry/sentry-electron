import { getCurrentHub } from '@sentry/core';
import { Integration } from '@sentry/types';
import { normalize } from '@sentry/utils';

import { getIPC } from '../ipc';

/**
 * Passes scope changes to the main process.
 */
export class ScopeToMain implements Integration {
  /** @inheritDoc */
  public static id: string = 'ScopeToMain';

  /** @inheritDoc */
  public readonly name: string;

  public constructor() {
    this.name = ScopeToMain.id;
  }

  /** @inheritDoc */
  public setupOnce(): void {
    this._setupScopeListener();
  }

  /**
   * Sends the scope to the main process when it updates.
   */
  private _setupScopeListener(): void {
    const scope = getCurrentHub().getScope();
    if (scope) {
      const ipc = getIPC();

      scope.addScopeListener((updatedScope) => {
        ipc.sendScope(JSON.stringify(normalize(updatedScope, 20, 2_000)));
        scope.clearBreadcrumbs();
        scope.clearAttachments();
      });
    }
  }
}
