import { defineIntegration } from '@sentry/core';
import { RendererProcessAnrOptions } from '../../common/ipc';
import { getIPC } from '../ipc';

interface Options {
  /**
   * The threshold in milliseconds for what constitutes an event loop block.
   */
  threshold: number;

  /**
   * @ignore To remove in next major version.
   */
  pollInterval?: number;

  /**
   * @ignore To remove in next major version.
   */
  captureStackTrace?: boolean;
}

export const eventLoopBlockIntegration = defineIntegration((options?: Options) => {
  const anrThreshold = options?.threshold ?? 1000;
  const pollInterval = options?.pollInterval || anrThreshold / 2;

  return {
    name: 'EventLoopBlockRenderer',
    setup() {
      const config: RendererProcessAnrOptions = {
        pollInterval,
        anrThreshold,
        captureStackTrace: true,
        ...options,
      };

      const ipc = getIPC();

      // eslint-disable-next-line no-restricted-globals
      ipc.sendStatus({ status: document.visibilityState, config });

      setInterval(() => {
        ipc.sendStatus({ status: 'alive', config });
      }, config.pollInterval);
    },
  };
});
