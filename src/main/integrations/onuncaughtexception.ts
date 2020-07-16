import { getCurrentHub } from '@sentry/core';
import { NodeClient } from '@sentry/node/esm/client';
import { Event, Integration, Severity } from '@sentry/types';
import { isError } from '@sentry/utils';
import { dialog } from 'electron';

/** Capture unhandled erros. */
export class OnUncaughtException implements Integration {
  /**
   * @inheritDoc
   */
  public name: string = OnUncaughtException.id;

  /**
   * @inheritDoc
   */
  public static id: string = 'OnUncaughtException';

  /**
   * @inheritDoc
   */
  public constructor(
    private readonly _options: {
      /** Fatal Error callback */
      onFatalError?(firstError: Error, secondError?: Error): void;
    } = {},
  ) {}

  /**
   * @inheritDoc
   */
  public setupOnce(): void {
    global.process.on('uncaughtException', (error: Error) => {
      const self = getCurrentHub().getIntegration(OnUncaughtException);
      if (self) {
        getCurrentHub().withScope(async scope => {
          scope.addEventProcessor(async (event: Event) => ({
            ...event,
            level: Severity.Fatal,
          }));

          let theError = error;
          if (!isError(error) && error.stack) {
            theError = new Error();
            theError.message = error.message;
            theError.stack = error.stack;
            theError.name = error.name;
          }

          const nodeClient = getCurrentHub().getClient() as NodeClient;
          nodeClient.captureException(theError, { originalException: error }, getCurrentHub().getScope());
          await nodeClient.flush(nodeClient.getOptions().shutdownTimeout || 2000);

          if (this._options.onFatalError) {
            this._options.onFatalError(error);
          } else if (global.process.listenerCount('uncaughtException') <= 2) {
            // In addition to this handler there is always one in Electron
            // The dialog is only shown if there are no other handlers
            console.error('Uncaught Exception:');
            console.error(error);
            const ref = error.stack;
            const stack = ref !== undefined ? ref : `${error.name}: ${error.message}`;
            const message = `Uncaught Exception:\n${stack}`;
            dialog.showErrorBox('A JavaScript error occurred in the main process', message);
          }
        });
      }
    });
  }
}
