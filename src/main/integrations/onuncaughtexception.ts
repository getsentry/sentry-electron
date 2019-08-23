import { getCurrentHub, NodeClient } from '@sentry/node';
import { Integration, Event, Severity } from '@sentry/types';
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
    private readonly options: {
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

          const nodeClient = getCurrentHub().getClient() as NodeClient;
          nodeClient.captureException(error, { originalException: error }, getCurrentHub().getScope());

          // TODO: use flush here
          if (this.options.onFatalError) {
            this.options.onFatalError(error);
          } else if (global.process.listenerCount('uncaughtException') <= 2) {
            // In addition to this handler there is always one in Electron
            // The dialog is only show if there are no other handlers
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
