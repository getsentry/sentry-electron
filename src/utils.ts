// tslint:disable-next-line:no-implicit-dependencies
import { app, remote, session } from 'electron';
import { join } from 'path';

let userAgent = '';

/** Returns whether the SDK is running in the main process. */
export function isMainProcess(): boolean {
  return process.type === 'browser';
}

/** Returns whether the SDK is running in a renderer process. */
export function isRenderProcess(): boolean {
  return process.type === 'renderer';
}

/** Returns the Electron App instance. */
export function getApp(): Electron.App {
  return isMainProcess() ? app : remote.app;
}

/** Gets the path to the Sentry cache directory. */
export function getCachePath(): string {
  return join(getApp().getPath('userData'), 'sentry');
}

/** Returns the user agent this SDK will use in events. */
export function getUserAgent(): string {
  if (userAgent === '' && session.defaultSession) {
    userAgent = session.defaultSession.getUserAgent();
  }

  return userAgent;
}
