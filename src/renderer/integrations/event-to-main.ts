import { Event, EventProcessor, Integration } from '@sentry/types';
import { normalize } from '@sentry/utils';

import { getIPC } from '../ipc';

/**
 * @deprecated Events are now sent to the main process via a custom transport.
 *
 * Passes events to the main process.
 */
export class EventToMain implements Integration {
  /** @inheritDoc */
  public static id = 'EventToMain';

  /** @inheritDoc */
  public readonly name: string;

  public constructor() {
    // eslint-disable-next-line deprecation/deprecation
    this.name = EventToMain.id;
  }

  /** @inheritDoc */
  public setupOnce(addGlobalEventProcessor: (callback: EventProcessor) => void): void {
    const ipc = getIPC();

    addGlobalEventProcessor((event: Event) => {
      // Ensure breadcrumbs is not `undefined` as `walk` translates it into a string
      event.breadcrumbs = event.breadcrumbs || [];

      // Remove the environment as it defaults to 'production' and overwrites the main process environment
      event.environment = undefined;

      ipc.sendEvent(JSON.stringify(normalize(event, 20, 2_000)));
      // Events are handled and sent from the main process so we return null here so nothing is sent from the renderer
      return null;
    });
  }
}
