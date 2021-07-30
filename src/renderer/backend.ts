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

    // We don't need a dsn in the renderer because events are passed through the main process
    // We still need a valid looking dsn or the browser sdk will not start
    options.dsn = options.dsn || 'http://1234@fake_dsn_not.used/12345';

    super(options);

    if (window.__SENTRY_IPC__ == undefined) {
      // eslint-disable-next-line no-console
      console.warn(
        'It looks like preload code injection has failed which can be caused by a number of issues. \
Check out the docs: https://docs.sentry.io/platforms/javascript/guides/electron/#preload-injection',
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
