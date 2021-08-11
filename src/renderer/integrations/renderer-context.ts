import { Event, EventProcessor, Integration } from '@sentry/types';

import { AppContext, mergeEvents, normalizeEvent } from '../../common';

/**
 * Fetches context from the main process so the browser SDK can be used in isolation
 */
export class RendererContext implements Integration {
  /** @inheritDoc */
  public static id: string = 'RendererContext';

  /** @inheritDoc */
  public name: string = RendererContext.id;

  /** Caches Electron context */
  private _appContext?: Promise<AppContext>;

  /** @inheritDoc */
  public setupOnce(addGlobalEventProcessor: (callback: EventProcessor) => void): void {
    addGlobalEventProcessor((event: Event) => {
      return this._addContextToEvent(event);
    });
  }

  /** Adds Electron context to an event */
  private async _addContextToEvent(event: Event): Promise<Event> {
    if (!this._appContext) {
      this._appContext = this._getContextFromMain();
    }

    const appContext = await this._appContext;

    return mergeEvents(appContext.eventDefaults, normalizeEvent(event, appContext.appBasePath));
  }

  /** Asynchronously fetches context from the main process */
  private async _getContextFromMain(): Promise<AppContext> {
    return new Promise((resolve) => {
      window.__SENTRY_IPC__?.getContext((event) => resolve(JSON.parse(event)));
    });
  }
}
