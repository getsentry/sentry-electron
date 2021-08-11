import { getCurrentHub } from '@sentry/core';
import { flush } from '@sentry/node';
import { Integration, SessionStatus } from '@sentry/types';
import { app } from 'electron';

/** Adds Electron context to events and normalises paths. */
export class MainProcessSession implements Integration {
  /** @inheritDoc */
  public static id: string = 'MainProcessSession';

  /** @inheritDoc */
  public name: string = MainProcessSession.id;

  /** @inheritDoc */
  public setupOnce(): void {
    const hub = getCurrentHub();
    hub.startSession();

    this._addExitHandlerLast();

    // We hook 'before-quit' and ensure our exit handler is still the last listener
    app.on('before-quit', () => {
      this._addExitHandlerLast();
    });
  }

  /**
   * Hooks 'will-quit' but ensures the handler is always last so it
   * doesn't interfere with any existing user handlers
   */
  private _addExitHandlerLast(): void {
    app.removeListener('will-quit', this._exitHandler);
    app.on('will-quit', this._exitHandler);
  }

  /** Handles the exit */
  private _exitHandler: (event: Electron.Event) => Promise<void> = async (event: Electron.Event) => {
    event.preventDefault();
    const hub = getCurrentHub();

    const session = hub.getScope()?.getSession();
    const terminalStates = [SessionStatus.Exited, SessionStatus.Crashed];

    if (session && !terminalStates.includes(session.status)) {
      hub.endSession();
    }

    await flush();
    app.exit();
  };
}
