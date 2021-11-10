import { Event, EventProcessor, Integration } from '@sentry/types';

import { walk } from '../../common';
import { IPC } from '../ipc';

/**
 * Passes events to the main process.
 */
export class EventToMain implements Integration {
  /** @inheritDoc */
  public static id: string = 'EventToMain';

  /** @inheritDoc */
  public name: string = EventToMain.id;

  /** @inheritDoc */
  public setupOnce(addGlobalEventProcessor: (callback: EventProcessor) => void): void {
    addGlobalEventProcessor(async (event: Event) => {
      // Ensure breadcrumbs is not `undefined` as `walk` translates it into a string
      event.breadcrumbs = event.breadcrumbs || [];

      // Remove the environment as it defaults to 'production' and overwrites the main process environment
      delete event.environment;

      // eslint-disable-next-line no-restricted-globals
      await IPC.sendEvent(JSON.stringify(event, walk));
      // Events are handled and sent from the main process so we return null here so nothing is sent from the renderer
      return null;
    });
  }
}
