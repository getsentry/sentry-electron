import { getCurrentHub, makeSession, updateSession } from '@sentry/core';
import { flush, NodeClient } from '@sentry/node';
import { SerializedSession, Session, SessionContext, SessionStatus } from '@sentry/types';
import { logger } from '@sentry/utils';

import { sentryCachePath } from './fs';
import { Store } from './store';

const PERSIST_INTERVAL_MS = 60_000;

/** Stores the app session in case of termination due to main process crash or app killed */
const sessionStore = new Store<SessionContext | undefined>(sentryCachePath, 'session', undefined);

/** Previous session that did not exit cleanly */
let previousSession: Promise<Partial<Session> | undefined> | undefined = sessionStore.get();

let persistTimer: NodeJS.Timer | undefined;

/** Starts a session */
export async function startSession(): Promise<void> {
  const hub = getCurrentHub();
  await sessionStore.set(hub.startSession());

  // Every PERSIST_INTERVAL, write the session to disk
  persistTimer = setInterval(async () => {
    const currentSession = hub.getScope()?.getSession();
    // Only bother saving if it hasn't already ended
    if (currentSession && currentSession.status === 'ok') {
      await sessionStore.set(currentSession);
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

  await sessionStore.clear();

  await flush(2_000);
}

/** Determines if a Date is likely to have occurred in the previous uncompleted session */
export async function unreportedDuringLastSession(crashDate: Date | undefined): Promise<boolean> {
  if (!crashDate) {
    return false;
  }

  const previousSessionModified = await sessionStore.getModifiedDate();
  // There is no previous session
  if (previousSessionModified == undefined) {
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
  const client = getCurrentHub().getClient<NodeClient>();

  const previous = await previousSession;

  if (previous && client) {
    // Ignore if the previous session is already ended
    if (previous.status !== 'ok') {
      previousSession = undefined;
      return;
    }

    const status: SessionStatus = crashed ? 'crashed' : 'abnormal';

    logger.log(`Found previous ${status} session`);

    const sesh = makeSession(previous);

    updateSession(sesh, {
      status,
      errors: (sesh.errors || 0) + 1,
      release: (previous as unknown as SerializedSession).attrs?.release,
      environment: (previous as unknown as SerializedSession).attrs?.environment,
    });

    await client.sendSession(sesh);

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
    updateSession(session, { status: 'crashed', errors: (session.errors += 1) });
  } else {
    logger.log('Session already ended');
  }

  hub.captureSession();
}
