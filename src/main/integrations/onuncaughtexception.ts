import { getCurrentHub, NodeClient } from '@sentry/node';
import { Integration, SentryEvent, Severity } from '@sentry/types';
import { dialog } from 'electron';

/** Capture unhandled erros. */
export class OnUncaughtException implements Integration {
  /**
   * @inheritDoc
   */
  public name: string = 'OnUncaughtException';

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
  public install(): void {
    global.process.on('uncaughtException', (error: Error) => {
      getCurrentHub().withScope(async scope => {
        scope.addEventProcessor(async (event: SentryEvent) => ({
          ...event,
          level: Severity.Fatal,
        }));

        const nodeClient = getCurrentHub().getClient() as NodeClient;
        await nodeClient.captureException(error, { originalException: error }, getCurrentHub().getScope());

        if (this.options.onFatalError) {
          this.options.onFatalError(error);
        } else {
          console.error('Uncaught Exception:');
          console.error(error);
          const ref = error.stack;
          const stack = ref !== undefined ? ref : `${error.name}: ${error.message}`;
          const message = `Uncaught Exception:\n${stack}`;
          dialog.showErrorBox('A JavaScript error occurred in the main process', message);
        }
      });
    });
  }
}
