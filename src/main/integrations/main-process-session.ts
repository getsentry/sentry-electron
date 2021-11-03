import { getCurrentHub } from '@sentry/core';
import { flush } from '@sentry/node';
import { Integration, SessionStatus } from '@sentry/types';
import { logger } from '@sentry/utils';
import { app } from 'electron';

const TERMINAL_STATES = [SessionStatus.Exited, SessionStatus.Crashed];

/** Tracks sessions as the main process lifetime. */
export class MainProcessSession implements Integration {
  /** @inheritDoc */
  public static id: string = 'MainProcessSession';

  /** @inheritDoc */
  public name: string = MainProcessSession.id;

  /** @inheritDoc */
  public setupOnce(): void {
    const hub = getCurrentHub();
    logger.log('MainProcessSession - Start session');
    hub.startSession();

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
    logger.log('MainProcessSession - Exit Handler');

    // Stop the exit so we have time to send the session
    event.preventDefault();
    const hub = getCurrentHub();

    const session = hub.getScope()?.getSession();

    if (session && !TERMINAL_STATES.includes(session.status)) {
      logger.log('MainProcessSession - Ending session');
      hub.endSession();
    } else {
      logger.log('MainProcessSession - Session was already ended', session);
    }

    await flush();

    // After flush we can safely exit
    app.exit();
  };
}

/** Sets the current session as crashed */
export function sessionCrashed(options: { forceCapture?: boolean } = {}): void {
  logger.log('Session Crashed');
  const hub = getCurrentHub();
  const session = hub.getScope()?.getSession();

  if (session && !TERMINAL_STATES.includes(session.status)) {
    session.update({ status: SessionStatus.Crashed, errors: (session.errors += 1) });
  } else {
    logger.log('No session to update');
  }

  if (options.forceCapture) {
    hub.captureSession();
  }
}
