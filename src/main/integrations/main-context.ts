import { getCurrentHub } from '@sentry/core';
import { NodeClient } from '@sentry/node';
import { Event, EventProcessor, Integration } from '@sentry/types';
import { app } from 'electron';

import { mergeEvents, normalizeEvent } from '../../common';
import { getEventDefaults } from '../context';

/** Adds Electron context to events and normalises paths. */
export class MainContext implements Integration {
  /** @inheritDoc */
  public static id: string = 'MainContext';

  /** @inheritDoc */
  public name: string = MainContext.id;

  /** @inheritDoc */
  public setupOnce(addGlobalEventProcessor: (callback: EventProcessor) => void): void {
    const options = getCurrentHub().getClient<NodeClient>()?.getOptions();

    addGlobalEventProcessor(async (event: Event) => {
      const normalized = normalizeEvent(event, app.getAppPath());
      const defaults = await getEventDefaults(options?.release);
      const fullEvent = mergeEvents(defaults, normalized);

      // event.contexts.electron.crashed_process = 'browser' by default so nodejs events
      // have the correct context. We need to strip this for transactions because there
      // hasn't been a crash.
      if (fullEvent.type === 'transaction' && fullEvent.contexts?.electron) {
        delete fullEvent.contexts.electron;
      }

      return fullEvent;
    });
  }
}
