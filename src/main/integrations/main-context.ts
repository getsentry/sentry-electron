import { getCurrentHub } from '@sentry/core';
import { NodeClient } from '@sentry/node';
import { Event, EventProcessor, Integration } from '@sentry/types';
import * as deepMerge from 'deepmerge';
import { app } from 'electron';

import { normalizeEvent } from '../../common';
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
      return deepMerge(defaults, normalized);
    });
  }
}
