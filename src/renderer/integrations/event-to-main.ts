import { Event, EventProcessor, Integration } from '@sentry/types';
import { normalize } from '@sentry/utils';

import { getIPC } from '../ipc';

/**
 * Passes events to the main process.
 */
export class EventToMain implements Integration {
  /** @inheritDoc */
  public static id: string = 'EventToMain';

  /** @inheritDoc */
  public readonly name: string;

  public constructor() {
    this.name = EventToMain.id;
  }

  /** @inheritDoc */
  public setupOnce(addGlobalEventProcessor: (callback: EventProcessor) => void): void {
    const ipc = getIPC();

    addGlobalEventProcessor((event: Event) => {
      // Ensure breadcrumbs is not `undefined` as `walk` translates it into a string
      event.breadcrumbs = event.breadcrumbs || [];

      // Remove the environment as it defaults to 'production' and overwrites the main process environment
      delete event.environment;

      ipc.sendEvent(JSON.stringify(normalize(event, 20, 2_000)));
      // Events are handled and sent from the main process so we return null here so nothing is sent from the renderer
      return null;
    });
  }
}
