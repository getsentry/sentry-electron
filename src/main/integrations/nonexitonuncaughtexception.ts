import { Integration, SentryEvent, Severity } from '@sentry/types';
import { getDefaultHub } from '@sentry/node';
import { dialog } from 'electron';
import { addEventDefaults } from '../context';
import { normalizeEvent } from '../normalize';

/** Capture unhandled erros but don't exit process. */
export class NonExitOnUncaughtException implements Integration {
  /**
   * @inheritDoc
   */
  public name: string = 'NonExitOnUncaughtException';

  /**
   * @inheritDoc
   */
  public handler(error: Error): void {
    getDefaultHub().withScope(() => {
      getDefaultHub().addEventProcessor(async (event: SentryEvent) => {
        return normalizeEvent(await addEventDefaults(event));
      });
      getDefaultHub().addEventProcessor(async (event: SentryEvent) => ({
        ...event,
        level: Severity.Fatal,
      }));

      getDefaultHub().captureException(error);

      process.env.NODE_ENV !== 'production' &&
        dialog.showErrorBox(
          error.toString(),
          error.stack ? error.stack.toString() : 'No stacktrace available',
        );
    });
  }

  /**
   * @inheritDoc
   */
  public install(): void {
    global.process.on('uncaughtException', this.handler);
  }
}
