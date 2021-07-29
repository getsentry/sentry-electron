import { eventFromException, eventFromMessage } from '@sentry/browser';
import { BaseBackend, getCurrentHub } from '@sentry/core';
import { Event, EventHint, Severity } from '@sentry/types';
import { walk as walkUtil } from '@sentry/utils';

import { CommonBackend, ElectronOptions } from '../common';

/** Walks an object to perform a normalization on it with a maximum depth of 50 */
function walk(key: string, value: any): any {
  return walkUtil(key, value, 50);
}

/** Backend implementation for Electron renderer backends. */
export class RendererBackend extends BaseBackend<ElectronOptions> implements CommonBackend<ElectronOptions> {
  /** Creates a new Electron backend instance. */
  public constructor(options: ElectronOptions) {
    // Disable session tracking until we've decided how this should work with Electron
    options.autoSessionTracking = false;

    if (options.enableJavaScript === false) {
      options.enabled = false;
    }
    super(options);

    if (window.__SENTRY_IPC__ == undefined) {
      // eslint-disable-next-line no-console
      console.warn(
        `It looks like preload code injection has failed which can be caused by a number of issues

- Ensure you have called 'Sentry.init' in the main process!

- If you are using sessions, ensure preload scripts are being injected into the correct session

    @sentry/electron automatically injects preload scripts via the Electron session.setPreloads() API
    https://www.electronjs.org/docs/api/session#sessetpreloadspreloads
    It does this by default for the defaultSession.

    If you need preload scripts injected for other sessions, you can pass a function to 'init' in
    the main process that returns an array of sessions to add preload scripts to:

    const Sentry = require('@sentry/electron');
    const { session } = require('electron');

    Sentry.init({
      dsn: '__DSN__',
      preloadSessions: () => {
        return [session.fromPartition('persist:something'), session.defaultSession];
      }
    })

- Ensure preload scripts are not being overwritten

    If you are already using the session.setPreloads() API, you could be overwriting the scripts added
    by @sentry/electron. You can avoid this by appending your own preload script after the existing
    entries:

    const myPreloadPath = './some/preload/path/preload.js';
    const sentryPreloads = session.getPreloads();
    session.setPreloads([...sentryPreloads, myPreloadPath]);
`,
      );
    }

    this._setupScopeListener();
  }

  /**
   * @inheritDoc
   */
  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  public eventFromException(exception: any, hint?: EventHint): PromiseLike<Event> {
    return eventFromException(this._options, exception, hint);
  }

  /**
   * @inheritDoc
   */
  public eventFromMessage(message: string, level?: Severity, hint?: EventHint): PromiseLike<Event> {
    return eventFromMessage(this._options, message, level, hint);
  }

  /**
   * @inheritDoc
   */
  public sendEvent(event: Event): void {
    // Ensure breadcrumbs is not `undefined` as `walk` translates it into a string
    event.breadcrumbs = event.breadcrumbs || [];
    // We pass through JSON because in Electron >= 8, IPC uses v8's structured clone algorithm and throws errors if
    // objects have functions. Calling walk makes sure to break circular references.
    window.__SENTRY_IPC__?.sendEvent(JSON.stringify(event, walk));
  }

  /**
   * Sends the scope to the main process once it updates.
   */
  private _setupScopeListener(): void {
    const scope = getCurrentHub().getScope();
    if (scope) {
      scope.addScopeListener(updatedScope => {
        window.__SENTRY_IPC__?.sendScope(JSON.stringify(updatedScope, walk));
        scope.clearBreadcrumbs();
      });
    }
  }
}
