/* eslint-disable no-restricted-globals */
import { getIPC } from './ipc';

/**
 * Enables the sending of ANR messages to the main process.
 */
export function enableAnrRendererMessages(): void {
  const ipc = getIPC();

  document.addEventListener('visibilitychange', () => {
    ipc.sendStatus(document.visibilityState);
  });

  ipc.sendStatus(document.visibilityState);

  setInterval(() => {
    ipc.sendStatus('alive');
  }, 100);
}
