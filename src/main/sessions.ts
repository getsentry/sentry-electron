import { getCurrentHub, makeSession, updateSession } from '@sentry/core';
import { flush, NodeClient } from '@sentry/node';
import { SerializedSession, Session, SessionContext, SessionStatus } from '@sentry/types';
import { logger } from '@sentry/utils';
import { app } from 'electron';

import { sentryCachePath } from './fs';
import { Store } from './store';

const PERSIST_INTERVAL_MS = 60_000;

/** Stores the app session in case of termination due to main process crash or app killed */
const sessionStore = new Store<SessionContext | undefined>(sentryCachePath, 'session', undefined);

/** Previous session if it did not exit cleanly */
let previousSession: Promise<Partial<Session> | undefined> | undefined = sessionStore.get();

let persistTimer: NodeJS.Timer | undefined;

/** Starts a session */
export async function startSession(sendOnCreate: boolean): Promise<void> {
  const hub = getCurrentHub();
  const session = hub.startSession();

  if (sendOnCreate) {
    hub.captureSession();
  }

  await sessionStore.set(session);

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
  const options = client?.getOptions();

  if (options?.autoSessionTracking === false) {
    return;
  }

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

/**
 * End the current session on app exit
 */
export function endSessionOnExit(): void {
  // 'before-quit' is always called before 'will-quit' so we listen there and ensure our 'will-quit' handler is still
  // the last listener
  app.on('before-quit', () => {
    // We track the end of sessions via the 'will-quit' event which is the last event emitted before close.
    //
    // We need to be the last 'will-quit' listener so as not to interfere with any user defined listeners which may
    // call `event.preventDefault()` to abort the exit.
    app.removeListener('will-quit', exitHandler);
    app.on('will-quit', exitHandler);
  });
}

/** Handles the exit */
const exitHandler: (event: Electron.Event) => Promise<void> = async (event: Electron.Event) => {
  if (event.defaultPrevented) {
    return;
  }

  logger.log('[Session] Exit Handler');

  // Stop the exit so we have time to send the session
  event.preventDefault();

  try {
    // End the session
    await endSession();
  } catch (e) {
    // Ignore and log any errors which would prevent app exit
    logger.warn('[Session] Error ending session:', e);
  }

  app.exit();
};
