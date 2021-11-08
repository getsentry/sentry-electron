import { getCurrentHub } from '@sentry/core';
import { flush, NodeClient } from '@sentry/node';
import { SessionContext, SessionStatus } from '@sentry/types';
import { logger } from '@sentry/utils';
import { app } from 'electron';
import { join } from 'path';

import { Store } from './store';
import { ElectronNetTransport } from './transports/electron-net';

const TERMINAL_STATES = [SessionStatus.Exited, SessionStatus.Crashed];

const sessionStore = new Store<SessionContext | undefined>(
  join(app.getPath('userData'), 'sentry'),
  'session',
  undefined,
);

let previousSession = sessionStore.get();

/** Starts a session */
export function startSession(): void {
  const hub = getCurrentHub();
  sessionStore.set(hub.startSession());
}

/** Cleanly ends a session */
export async function endSession(): Promise<void> {
  const hub = getCurrentHub();

  const session = hub.getScope()?.getSession();

  if (session) {
    if (!TERMINAL_STATES.includes(session.status)) {
      logger.log('Ending session');
      hub.endSession();
    } else {
      logger.log('Session was already ended');
    }
  } else {
    logger.log('No session');
  }

  sessionStore.set(undefined, true);

  await flush();
}

/** Checks if the previous session needs sending as crashed or abnormal  */
export async function checkPreviousSession(crashed: boolean): Promise<void> {
  if (previousSession) {
    const status = crashed ? SessionStatus.Crashed : SessionStatus.Abnormal;

    logger.log(`Found previous ${status} session`);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const transport = (getCurrentHub().getClient<NodeClient>() as any)
      ._getBackend()
      .getTransport() as ElectronNetTransport;

    await transport.sendSession({ ...previousSession, status, errors: (previousSession.errors || 0) + 1 });

    previousSession = undefined;
  }
}

/** Sets the current session as crashed */
export function sessionCrashed(): void {
  logger.log('Session Crashed');
  const hub = getCurrentHub();
  const session = hub.getScope()?.getSession();

  if (!session) {
    logger.log('No session to update');
    return;
  }

  if (!TERMINAL_STATES.includes(session.status)) {
    logger.log(`Setting session as crashed`);
    session.update({ status: SessionStatus.Crashed, errors: (session.errors += 1) });
  } else {
    logger.log('Session already ended');
  }

  hub.captureSession();
}
