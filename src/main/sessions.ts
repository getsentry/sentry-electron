import type { SerializedSession, Session, SessionContext, SessionStatus } from '@sentry/core';
import {
  captureSession,
  debug,
  endSession as endSessionCore,
  getClient,
  getIsolationScope,
  makeSession,
  startSession as startSessionCore,
  updateSession,
} from '@sentry/core';
import type { NodeClient } from '@sentry/node';
import { flush } from '@sentry/node';
import { app, BrowserWindow } from 'electron';
import { getSentryCachePath } from './electron-normalize.js';
import { Store } from './store.js';

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
  delete (copy as unknown as { toJSON?: unknown }).toJSON;
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
    if (currentSession?.status === 'ok') {
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

    if (previous.status === 'ok' || previous.status === 'exited') {
      // A minidump from the previous run means it crashed, even if it
      // was persisted as exited.
      scope.setSession(makeSession({ ...previous, status: 'ok' }));
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
  return checkPreviousSession(false);
}

/** Checks if the previous session needs sending as crashed, abnormal or exited */
export async function checkPreviousSession(crashed: boolean): Promise<void> {
  const client = getClient<NodeClient>();

  const previous = await previousSession;

  if (previous && client) {
    previousSession = undefined;

    if (previous.status !== 'ok' && previous.status !== 'exited') {
      return;
    }

    const sesh = makeSession(previous);
    const attrs = (previous as unknown as SerializedSession).attrs;

    if (previous.status === 'exited' && !crashed) {
      debug.log('Found previous exited session');
      // Keep the timestamp and duration from when the session ended
      updateSession(sesh, {
        timestamp: previous.timestamp,
        release: attrs?.release,
        environment: attrs?.environment,
      });
    } else {
      const status: SessionStatus = crashed ? 'crashed' : 'abnormal';

      debug.log(`Found previous ${status} session`);

      updateSession(sesh, {
        status,
        errors: (sesh.errors || 0) + 1,
        release: attrs?.release,
        environment: attrs?.environment,
      });
    }

    client.sendSession(sesh);
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

  // On Windows, 'before-quit' and 'will-quit' are not emitted on system
  // shutdown, restart or user logoff. Windows can end the process soon
  // after 'session-end', so we write the ended session to disk and send
  // it on the next start.
  if (process.platform === 'win32') {
    for (const window of BrowserWindow.getAllWindows()) {
      window.once('session-end', persistSessionAsExited);
    }

    app.on('browser-window-created', (_, window) => {
      window.once('session-end', persistSessionAsExited);
    });
  }

  // `app.exit()` does not emit 'before-quit' or 'will-quit'
  const originalExit = app.exit.bind(app);
  app.exit = (exitCode?: number): void => {
    persistSessionAsExited();
    originalExit(exitCode);
  };
}

/**
 * Synchronously writes the current session to disk as exited.
 *
 * The session is not ended in memory. If the app still exits through
 * 'will-quit', the session is sent then and removed from disk.
 */
function persistSessionAsExited(): void {
  const session = getIsolationScope().getSession();

  if (session?.status !== 'ok') {
    return;
  }

  if (persistTimer) {
    clearInterval(persistTimer);
  }

  debug.log('[Session] Persisting session as exited');

  const exited = makeSession(makeSessionSafeToSerialize(session));
  updateSession(exited, { status: 'exited' });
  getSessionStore().setSync(makeSessionSafeToSerialize(exited));
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
