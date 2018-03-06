import { app, remote } from 'electron';

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

/** Helper to filter an array with asynchronous callbacks. */
export async function filterAsync<T>(
  array: T[],
  predicate: (item: T) => Promise<boolean>,
  thisArg?: any,
): Promise<T[]> {
  const verdicts = await Promise.all(array.map(predicate, thisArg));
  return array.filter((_, index) => verdicts[index]);
}
