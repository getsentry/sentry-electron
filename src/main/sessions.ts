import {
  captureSession,
  debug,
  endSession as endSessionCore,
  getClient,
  getIsolationScope,
  makeSession,
  SerializedSession,
  Session,
  SessionContext,
  SessionStatus,
  startSession as startSessionCore,
  updateSession,
} from '@sentry/core';
import { flush, NodeClient } from '@sentry/node';
import { app } from 'electron';
import { getSentryCachePath } from './electron-normalize';
import { Store } from './store';

const PERSIST_INTERVAL_MS = 60_000;

/** Stores the app session in case of termination due to main process crash or app killed */
let sessionStore: Store<SessionContext | undefined> | undefined;
/** Previous session if it did not exit cleanly */
let previousSession: Promise<Partial<Session> | undefined> | undefined;

function getSessionStore(): Store<SessionContext | undefined> {
  if (!sessionStore) {
    sessionStore = new Store<SessionContext | undefined>(getSentryCachePath(), 'session', undefined);
    previousSession = sessionStore.get().then((sesh) => (sesh ? makeSession(sesh) : sesh));
  }

  return sessionStore;
}

/** Copies a session and removes the toJSON function so it can be serialised without conversion */
function makeSessionSafeToSerialize(session: Session): Session {
  const copy = { ...session };
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  delete (copy as any).toJSON;
  return copy;
}

let persistTimer: ReturnType<typeof setInterval> | undefined;

/** Starts a session */
export function startSession(sendOnCreate: boolean): void {
  const session = startSessionCore();

  if (sendOnCreate) {
    captureSession();
  }

  getSessionStore()
    .set(makeSessionSafeToSerialize(session))
    .catch(() => {
      // Does not throw
    });

  // Every PERSIST_INTERVAL, write the session to disk
  persistTimer = setInterval(async () => {
    const currentSession = getIsolationScope().getSession();
    // Only bother saving if it hasn't already ended
    if (currentSession && currentSession.status === 'ok') {
      await getSessionStore().set(makeSessionSafeToSerialize(currentSession));
    }
  }, PERSIST_INTERVAL_MS);
}

/** Cleanly ends a session */
export async function endSession(): Promise<void> {
  // Once the session had ended there is no point persisting it
  if (persistTimer) {
    clearInterval(persistTimer);
  }

  const session = getIsolationScope().getSession();

  if (session) {
    if (session.status === 'ok') {
      debug.log('Ending session');
      endSessionCore();
    } else {
      debug.log('Session was already ended');
    }
  } else {
    debug.log('No session');
  }

  await getSessionStore().clear();

  await flush(2_000);
}

/** Determines if a Date is likely to have occurred in the previous uncompleted session */
export async function unreportedDuringLastSession(crashDate: Date | undefined): Promise<boolean> {
  if (!crashDate) {
    return false;
  }

  const previousSessionModified = await getSessionStore().getModifiedDate();
  // There is no previous session
  if (previousSessionModified === undefined) {
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

/** Sets the previous session as the current session and returns any existing session */
export async function setPreviousSessionAsCurrent(): Promise<Session | undefined> {
  const previous = await previousSession;

  const scope = getIsolationScope();
  const currentSession = scope.getSession();

  if (previous) {
    previousSession = undefined;

    if (previous.status === 'ok') {
      scope.setSession(makeSession(previous));
    }
  }

  return currentSession;
}

/** Restores a session */
export function restorePreviousSession(session: Session): void {
  getIsolationScope().setSession(session);
}

/** Report the previous session as abnormal */
export async function previousSessionWasAbnormal(): Promise<void> {
  const client = getClient<NodeClient>();

  const previous = await previousSession;

  if (previous && client) {
    // Ignore if the previous session is already ended
    if (previous.status !== 'ok') {
      previousSession = undefined;
      return;
    }

    debug.log('Found previous abnormal session');

    const sesh = makeSession(previous);

    updateSession(sesh, {
      status: 'abnormal',
      errors: (sesh.errors || 0) + 1,
      release: (previous as unknown as SerializedSession).attrs?.release,
      environment: (previous as unknown as SerializedSession).attrs?.environment,
    });

    await client.sendSession(sesh);

    previousSession = undefined;
  }
}

/** Checks if the previous session needs sending as crashed or abnormal  */
export async function checkPreviousSession(crashed: boolean): Promise<void> {
  const client = getClient<NodeClient>();

  const previous = await previousSession;

  if (previous && client) {
    // Ignore if the previous session is already ended
    if (previous.status !== 'ok') {
      previousSession = undefined;
      return;
    }

    const status: SessionStatus = crashed ? 'crashed' : 'abnormal';

    debug.log(`Found previous ${status} session`);

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

  debug.log('Session Crashed');
  const session = getIsolationScope().getSession();

  if (!session) {
    debug.log('No session to update');
    return;
  }

  if (session.status === 'ok') {
    debug.log('Setting session as crashed');
    const errors = session.errors + 1;
    updateSession(session, { status: 'crashed', errors });
    captureSession();
  } else {
    debug.log('Session already ended');
  }
}

/** Sets the current session as ANR */
export function sessionAnr(): void {
  // stop persisting session
  if (persistTimer) {
    clearInterval(persistTimer);
  }

  const session = getIsolationScope().getSession();

  if (!session) {
    return;
  }

  if (session.status === 'ok') {
    debug.log('Setting session as abnormal ANR');
    updateSession(session, { status: 'abnormal', abnormal_mechanism: 'anr_foreground' });
    captureSession();
  }
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

  debug.log('[Session] Exit Handler');

  // Stop the exit so we have time to send the session
  event.preventDefault();

  try {
    // End the session
    await endSession();
  } catch (e) {
    // Ignore and log any errors which would prevent app exit
    debug.warn('[Session] Error ending session:', e);
  }

  app.exit();
};
