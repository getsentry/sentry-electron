import { Integration } from '@sentry/types';
import { app, BrowserWindow } from 'electron';

import { ELECTRON_MAJOR_VERSION } from '../electron-normalize';
import { endSession, endSessionOnExit, startSession } from '../sessions';

interface Options {
  /**
   * Number of seconds to wait before ending a session after the app loses focus.
   *
   * Default: 10 seconds
   */
  backgroundTimeoutSeconds?: number;
}

// The state can be, active, inactive, or waiting for a timeout
type SessionState = 'active' | 'inactive' | { timer: NodeJS.Timeout };

/**
 * Tracks sessions as BrowserWindows focused.
 *
 * Supports Electron >= v12
 */
export class BrowserWindowSession implements Integration {
  /** @inheritDoc */
  public static id: string = 'BrowserWindowSession';

  /** @inheritDoc */
  public readonly name: string;

  private _state: SessionState;

  public constructor(private readonly _options: Options = {}) {
    if (ELECTRON_MAJOR_VERSION < 12) {
      throw new Error('BrowserWindowSession requires Electron >= v12');
    }

    this.name = BrowserWindowSession.id;
    this._state = 'inactive';
  }

  /** @inheritDoc */
  public setupOnce(): void {
    app.on('browser-window-created', (_event, window) => {
      window.on('focus', this._windowStateChanged);
      window.on('blur', this._windowStateChanged);
      window.on('show', this._windowStateChanged);
      window.on('hide', this._windowStateChanged);

      // when the window is closed we need to remove the listeners
      window.once('closed', () => {
        window.removeListener('focus', this._windowStateChanged);
        window.removeListener('blur', this._windowStateChanged);
        window.removeListener('show', this._windowStateChanged);
        window.removeListener('hide', this._windowStateChanged);
      });
    });

    // if the app exits while the session is active, end the session
    endSessionOnExit();
  }

  private _windowStateChanged = (): void => {
    // We need to test all windows for visibility AND focus
    const aWindowIsActive = BrowserWindow.getAllWindows().some((window) => window.isVisible() && window.isFocused());

    if (aWindowIsActive) {
      // We are now active
      if (this._state === 'inactive') {
        // If we were inactive, start a new session
        void startSession(true);
      } else if (typeof this._state !== 'string') {
        // Clear the timeout since the app has become active again
        clearTimeout(this._state.timer);
      }

      this._state = 'active';
    } else {
      if (this._state === 'active') {
        // We have become inactive, start the timeout
        const timeout = (this._options.backgroundTimeoutSeconds ?? 30) * 1_000;

        const timer = setTimeout(() => {
          // if the state says we're still waiting for the timeout, end the session
          if (typeof this._state !== 'string') {
            this._state = 'inactive';
            void endSession();
          }
        }, timeout)
          // unref so this timer doesn't block app exit
          .unref();

        this._state = { timer };
      }
    }
  };
}
