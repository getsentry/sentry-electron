import { Integration } from '@sentry/types';
import { app, BrowserWindow } from 'electron';

import { endSession, endSessionOnExit, startSession } from '../sessions';

interface Options {
  /**
   * Number of seconds to wait before ending a session after the app loses focus.
   *
   * Default: 10 seconds
   */
  backgroundTimeoutSeconds?: number;
}

type SessionState = 'active' | 'inactive' | { timer: NodeJS.Timeout };

/** Tracks sessions as BrowserWindows focused. */
export class BrowserWindowSession implements Integration {
  /** @inheritDoc */
  public static id: string = 'BrowserWindowSession';

  /** @inheritDoc */
  public readonly name: string;

  private _state: SessionState;

  public constructor(private readonly _options: Options = {}) {
    this.name = BrowserWindowSession.id;
    this._state = 'inactive';
  }

  /** @inheritDoc */
  public setupOnce(): void {
    app.on('browser-window-blur', () => this._windowStateChanged());
    app.on('browser-window-focus', () => this._windowStateChanged());

    this._windowStateChanged();

    endSessionOnExit();
  }

  /**  */
  private _windowStateChanged(): void {
    const appHasFocus = !!BrowserWindow.getFocusedWindow();

    if (appHasFocus) {
      if (this._state === 'inactive') {
        void startSession(true);
      } else if (typeof this._state !== 'string') {
        // Clear the timeout since the app has become active again
        clearTimeout(this._state.timer);
      }

      this._state = 'active';
    } else {
      if (this._state === 'active') {
        const timeout = (this._options.backgroundTimeoutSeconds ?? 30) * 1_000;

        const timer = setTimeout(() => {
          // if we're still waiting for the timeout, end the session
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
  }
}
