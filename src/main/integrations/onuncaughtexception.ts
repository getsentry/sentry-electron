import { getDefaultHub, Handlers, NodeClient } from '@sentry/node';
import { Integration, SentryEvent, Severity } from '@sentry/types';

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
      onFatalError?(error: Error): void;
    } = {},
  ) {}

  /**
   * @inheritDoc
   */
  public install(): void {
    global.process.on('uncaughtException', (error: Error) => {
      getDefaultHub().withScope(async () => {
        getDefaultHub().addEventProcessor(async (event: SentryEvent) => ({
          ...event,
          level: Severity.Fatal,
        }));

        const nodeClient = getDefaultHub().getClient() as NodeClient;
        await nodeClient.captureException(error, getDefaultHub().getScope());

        if (this.options.onFatalError) {
          this.options.onFatalError(error);
        } else {
          Handlers.defaultOnFatalError(error);
        }
      });
    });
  }
}
