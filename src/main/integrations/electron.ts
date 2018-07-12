import { getDefaultHub } from '@sentry/node';
import { Integration, SentryEvent } from '@sentry/types';
import { addEventDefaults } from '../context';
import { normalizeEvent } from '../normalize';

/** Electron integration that cleans up the event. */
export class Electron implements Integration {
  /**
   * @inheritDoc
   */
  public name: string = 'Electron';

  /**
   * @inheritDoc
   */
  public install(): void {
    getDefaultHub().addEventProcessor(async (event: SentryEvent) => {
      return normalizeEvent(await addEventDefaults(event));
    });
  }
}
