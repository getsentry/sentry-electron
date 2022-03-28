import { getCurrentHub } from '@sentry/core';
import { flush, NodeClient } from '@sentry/node';
import { SessionContext, SessionStatus } from '@sentry/types';
import { logger } from '@sentry/utils';

import { sentryCachePath } from './fs';
import { Store } from './store';
import { ElectronNetTransport } from './transports/electron-net';

const PERSIST_INTERVAL_MS = 60_000;

/** Stores the app session in case of termination due to main process crash or app killed */
const sessionStore = new Store<SessionContext | undefined>(sentryCachePath, 'session', undefined);

/** Previous session that did not exit cleanly */
let previousSession = sessionStore.get();
const previousSessionModified = sessionStore.getModifiedDate();

let persistTimer: NodeJS.Timer | undefined;

/** Starts a session */
export function startSession(): void {
  const hub = getCurrentHub();
  sessionStore.set(hub.startSession());

  // Every PERSIST_INTERVAL, write the session to disk
  persistTimer = setInterval(() => {
    const currentSession = hub.getScope()?.getSession();
    // Only bother saving if it hasn't already ended
    if (currentSession && currentSession.status === 'ok') {
      sessionStore.set(currentSession);
    }
  }, PERSIST_INTERVAL_MS);
}

/** Cleanly ends a session */
export async function endSession(): Promise<void> {
  // Once the session had ended there is no point persisting it
  if (persistTimer) {
    clearInterval(persistTimer);
  }

  const hub = getCurrentHub();
  const session = hub.getScope()?.getSession();

  if (session) {
    if (session.status === 'ok') {
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

/** Determines if a Date is likely to have occurred in the previous uncompleted session */
export function unreportedDuringLastSession(crashDate: Date | undefined): boolean {
  if (!crashDate) {
    return false;
  }

  // There is no previous session
  if (!previousSessionModified) {
    return false;
  }

  const previousSessionModifiedTime = previousSessionModified.getTime();
  const crashTime = crashDate.getTime();

  // Session could have run until modified time + persist interval
  const prevSessionEnd = previousSessionModifiedTime + PERSIST_INTERVAL_MS;

  // Event cannot have occurred before last persist time, We add a 2 second overlap to be sure
  const lastPersist = previousSessionModifiedTime - 2_000;

  // If the crash occurred between the last persist and estimated end of session
  return crashTime > lastPersist && crashTime < prevSessionEnd;
}

/** Checks if the previous session needs sending as crashed or abnormal  */
export async function checkPreviousSession(crashed: boolean): Promise<void> {
  if (previousSession) {
    // Ignore if the previous session is already ended
    if (previousSession.status !== 'ok') {
      previousSession = undefined;
      return;
    }

    const status: SessionStatus = crashed ? 'crashed' : 'abnormal';

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
  // stop persisting session
  if (persistTimer) {
    clearInterval(persistTimer);
  }

  logger.log('Session Crashed');
  const hub = getCurrentHub();
  const session = hub.getScope()?.getSession();

  if (!session) {
    logger.log('No session to update');
    return;
  }

  if (session.status === 'ok') {
    logger.log('Setting session as crashed');
    session.update({ status: 'crashed', errors: (session.errors += 1) });
  } else {
    logger.log('Session already ended');
  }

  hub.captureSession();
}
