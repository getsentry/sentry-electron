import { Event, EventProcessor, Hub, Integration } from '@sentry/types';
import { normalize } from '@sentry/utils';

import { getIPC } from '../ipc';

/**
 * Passes events to the main process.
 */
export class EventToMain implements Integration {
  /** @inheritDoc */
  public static id: string = 'EventToMain';

  /** @inheritDoc */
  public name: string = EventToMain.id;

  /** @inheritDoc */
  public setupOnce(addGlobalEventProcessor: (callback: EventProcessor) => void, getCurrentHub: () => Hub): void {
    const ipc = getIPC();

    const beforeSend = getCurrentHub().getClient()?.getOptions().beforeSend || ((e) => e);

    addGlobalEventProcessor(async (ev, hint) => {
      const event = await beforeSend(ev, hint);

      if (event) {
        // Ensure breadcrumbs is not `undefined` as `walk` translates it into a string
        event.breadcrumbs = event.breadcrumbs || [];

        // Remove the environment as it defaults to 'production' and overwrites the main process environment
        delete event.environment;

        ipc.sendEvent(JSON.stringify(normalize(event, 20, 2_000)));
      }

      // Events are handled and sent from the main process so we return null here so nothing is sent from the renderer
      return null;
    });
  }
}
