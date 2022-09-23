import { Integration } from '@sentry/types';
import { logger } from '@sentry/utils';
import { app } from 'electron';

import { endSession, startSession } from '../sessions';

/** Tracks sessions as the main process lifetime. */
export class MainProcessSession implements Integration {
  /** @inheritDoc */
  public static id: string = 'MainProcessSession';

  /** @inheritDoc */
  public name: string = MainProcessSession.id;

  /** @inheritDoc */
  public setupOnce(): void {
    void startSession();

    // We track sessions via the 'will-quit' event which is the last event emitted before close.
    //
    // We need to be the last 'will-quit' listener so as not to interfere with any user defined listeners which may
    // call `event.preventDefault()`.
    this._ensureExitHandlerLast();

    // 'before-quit' is always called before 'will-quit' so we listen there and ensure our 'will-quit' handler is still
    // the last listener
    app.on('before-quit', () => {
      this._ensureExitHandlerLast();
    });
  }

  /**
   * Hooks 'will-quit' and ensures the handler is always last
   */
  private _ensureExitHandlerLast(): void {
    app.removeListener('will-quit', this._exitHandler);
    app.on('will-quit', this._exitHandler);
  }

  /** Handles the exit */
  private _exitHandler: (event: Electron.Event) => Promise<void> = async (event: Electron.Event) => {
    if (event.defaultPrevented) {
      return;
    }

    logger.log('[MainProcessSession] Exit Handler');

    // Stop the exit so we have time to send the session
    event.preventDefault();

    try {
      // End the session
      await endSession();
    } catch (e) {
      // Ignore and log any errors which would prevent app exit
      logger.warn('[MainProcessSession] Error ending session:', e);
    }

    app.exit();
  };
}
