import { RendererProcessAnrOptions } from '../common/ipc';
import { getIPC } from './ipc';

/**
 * Enables the sending of ANR messages to the main process.
 */
export function enableAnrRendererMessages(options: Partial<RendererProcessAnrOptions>): void {
  const config: RendererProcessAnrOptions = {
    pollInterval: 1_000,
    anrThreshold: 5_000,
    captureStackTrace: false,
    ...options,
  };

  const ipc = getIPC();

  // eslint-disable-next-line no-restricted-globals
  ipc.sendStatus({ status: document.visibilityState, config });

  setInterval(() => {
    ipc.sendStatus({ status: 'alive', config });
  }, config.pollInterval);
}
