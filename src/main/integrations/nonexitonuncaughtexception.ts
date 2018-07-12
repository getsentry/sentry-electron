import { getDefaultHub } from '@sentry/node';
import { Integration, SentryEvent, Severity } from '@sentry/types';
import {
  dialog,
  // tslint:disable-next-line:no-implicit-dependencies
} from 'electron';
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
  public install(): void {
    global.process.on('uncaughtException', (error: Error) => {
      getDefaultHub().withScope(() => {
        getDefaultHub().addEventProcessor(async (event: SentryEvent) =>
          normalizeEvent(await addEventDefaults(event)),
        );
        getDefaultHub().addEventProcessor(async (event: SentryEvent) => ({
          ...event,
          level: Severity.Fatal,
        }));

        getDefaultHub().captureException(error);

        if (process.env.NODE_ENV !== 'production') {
          dialog.showErrorBox(
            error.toString(),
            error.stack ? error.stack.toString() : 'No stacktrace available',
          );
        }
      });
    });
  }
}
