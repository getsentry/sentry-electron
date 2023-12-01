import { NodeClient } from '@sentry/node';
import { Event, EventHint, Integration } from '@sentry/types';
import { app } from 'electron';

import { mergeEvents, normalizeEvent } from '../../common';
import { getEventDefaults } from '../context';

/** Adds Electron context to events and normalises paths. */
export class MainContext implements Integration {
  /** @inheritDoc */
  public static id: string = 'MainContext';

  /** @inheritDoc */
  public readonly name: string;

  public constructor() {
    this.name = MainContext.id;
  }

  /** @inheritDoc */
  public setupOnce(): void {
    //
  }

  /** @inheritDoc */
  public async processEvent(event: Event, _: EventHint, client: NodeClient): Promise<Event> {
    const options = client.getOptions();
    const normalized = normalizeEvent(event, app.getAppPath());
    const defaults = await getEventDefaults(options?.release, options?.environment);
    return mergeEvents(defaults, normalized);
  }
}
