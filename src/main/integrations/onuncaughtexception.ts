import { getCurrentHub, getCurrentScope } from '@sentry/core';
import { NodeClient } from '@sentry/node';
import { Event, Integration } from '@sentry/types';
import { dialog } from 'electron';

/** Capture unhandled errors. */
export class OnUncaughtException implements Integration {
  /** @inheritDoc */
  public static id: string = 'OnUncaughtException';

  /** @inheritDoc */
  public readonly name: string;

  public constructor() {
    this.name = OnUncaughtException.id;
  }

  /**
   * @inheritDoc
   */
  public setupOnce(): void {
    const options = getCurrentHub().getClient<NodeClient>()?.getOptions();

    global.process.on('uncaughtException', (error: Error) => {
      const self = getCurrentHub().getIntegration(OnUncaughtException);
      if (self) {
        const scope = getCurrentScope();

        scope.addEventProcessor(async (event: Event) => ({
          ...event,
          level: 'fatal',
        }));

        const nodeClient = getCurrentHub().getClient() as NodeClient;
        nodeClient.captureException(
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
          getCurrentHub().getScope(),
        );

        nodeClient.flush(nodeClient.getOptions().shutdownTimeout || 2000).then(
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
      }
    });
  }
}
