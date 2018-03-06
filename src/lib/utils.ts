// tslint:disable-next-line:no-implicit-dependencies
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

/**
 * Creates a deep copy of the given object.
 *
 * The object must be serializable, i.e.:
 *  - It must not contain any cycles
 *  - Only primitive types are allowed (object, number, string, boolean)
 *  - Its depth should be considerably low for performance reasons
 *
 * @param object A JSON-serializable object.
 * @returns The object clone.
 */
export function clone<T>(object: T): T {
  return JSON.parse(JSON.stringify(object)) as T;
}
