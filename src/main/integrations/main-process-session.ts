import { getCurrentHub } from '@sentry/core';
import { flush, NodeClient } from '@sentry/node';
import { Integration, SessionContext, SessionStatus } from '@sentry/types';
import { logger } from '@sentry/utils';
import { app } from 'electron';
import { join } from 'path';

import { ElectronNetTransport } from '../transports/electron-net';
import { Store } from './store';

const TERMINAL_STATES = [SessionStatus.Exited, SessionStatus.Crashed];

const sessionStore: Store<SessionContext | undefined> = new Store(
  join(app.getPath('userData'), 'sentry'),
  'session',
  undefined,
);

let previousSession = sessionStore.get();

/** Tracks sessions as the main process lifetime. */
export class MainProcessSession implements Integration {
  /** @inheritDoc */
  public static id: string = 'MainProcessSession';

  /** @inheritDoc */
  public name: string = MainProcessSession.id;

  /** @inheritDoc */
  public setupOnce(): void {
    const hub = getCurrentHub();

    logger.log('[MainProcessSession] Start session');
    const newSession = hub.startSession();
    sessionStore.set(newSession);

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
    logger.log('[MainProcessSession] Exit Handler');

    // Stop the exit so we have time to send the session
    event.preventDefault();
    const hub = getCurrentHub();

    const session = hub.getScope()?.getSession();

    if (session && !TERMINAL_STATES.includes(session.status)) {
      logger.log('[MainProcessSession] Ending session');
      hub.endSession();
    } else {
      logger.log('[MainProcessSession] Session was already ended');
    }

    sessionStore.set(undefined, true);

    await flush();

    // After flush we can safely exit
    app.exit();
  };
}

/** Checks if the previous session needs sending as crashed or abnormal  */
export async function checkPreviousSession(crashed: boolean): Promise<void> {
  if (previousSession) {
    const status = crashed ? SessionStatus.Crashed : SessionStatus.Abnormal;

    logger.log(`[MainProcessSession] Previous session ${status}}`);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const transport = (getCurrentHub().getClient<NodeClient>() as any)
      ._getBackend()
      .getTransport() as ElectronNetTransport;

    previousSession.status = status;
    previousSession.errors = (previousSession.errors || 0) + 1;

    await transport.sendSession(previousSession);

    previousSession = undefined;
  }
}

/** Sets the current session as crashed */
export function sessionCrashed(): void {
  logger.log('[MainProcessSession] Session Crashed');
  const hub = getCurrentHub();
  const session = hub.getScope()?.getSession();

  if (!session) {
    logger.log('[MainProcessSession] No session to update');
    return;
  }

  if (!TERMINAL_STATES.includes(session.status)) {
    logger.log(`[MainProcessSession] Setting session as crashed`);
    session.update({ status: SessionStatus.Crashed, errors: (session.errors += 1) });
  } else {
    logger.log('[MainProcessSession] Session already ended');
  }

  hub.captureSession();
}
