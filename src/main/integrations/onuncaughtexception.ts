import { convertIntegrationFnToClass, getCurrentScope } from '@sentry/core';
import { NodeClient } from '@sentry/node';
import { Event, IntegrationFn } from '@sentry/types';
import { dialog } from 'electron';

const INTEGRATION_NAME = 'OnUncaughtException';

const onUncaughtException: IntegrationFn = () => {
  return {
    name: INTEGRATION_NAME,
    setup(client: NodeClient) {
      const options = client.getOptions();

      global.process.on('uncaughtException', (error: Error) => {
        const scope = getCurrentScope();

        scope.addEventProcessor(async (event: Event) => ({
          ...event,
          level: 'fatal',
        }));

        client.captureException(
          error,
          {
            originalException: error,
            data: {
              mechanism: {
                handled: false,
                type: 'generic',
              },
            },
          },
          scope,
        );

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
};

/** Capture unhandled errors. */
// eslint-disable-next-line deprecation/deprecation
export const OnUncaughtException = convertIntegrationFnToClass(INTEGRATION_NAME, onUncaughtException);
