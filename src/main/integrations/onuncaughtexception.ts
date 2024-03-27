import { defineIntegration } from '@sentry/core';
import { NodeClient } from '@sentry/node';
import { dialog } from 'electron';

/** Capture unhandled errors. */
export const onUncaughtExceptionIntegration = defineIntegration(() => {
  return {
    name: 'OnUncaughtException',
    setupOnce() {
      // noop
    },
    setup(client: NodeClient) {
      const options = client.getOptions();

      global.process.on('uncaughtException', (error: Error) => {
        client.captureException(error, {
          originalException: error,
          captureContext: {
            level: 'fatal',
          },
          data: {
            mechanism: {
              handled: false,
              type: 'generic',
            },
          },
        });

        client.flush(options.shutdownTimeout || 2000).then(
          () => {
            if (options?.onFatalError) {
              options.onFatalError(error);
            } else if (global.process.listenerCount('uncaughtException') <= 2) {
              // In addition to this handler there is always one in Electron
              // The dialog is only shown if there are no other handlers
              // eslint-disable-next-line no-console
              console.error('Uncaught Exception:');
              // eslint-disable-next-line no-console
              console.error(error);
              const ref = error.stack;
              const stack = ref !== undefined ? ref : `${error.name}: ${error.message}`;
              const message = `Uncaught Exception:\n${stack}`;
              dialog.showErrorBox('A JavaScript error occurred in the main process', message);
            }
          },
          () => {
            // ignore
          },
        );
      });
    },
  };
});
