/* eslint-disable max-lines */
import { NodeClient } from '@sentry/node';
import { Event, EventHint, SdkInfo } from '@sentry/types';
import { app } from 'electron';

import { SDK_VERSION } from './version';

export const SDK_NAME = 'sentry.javascript.electron';

/** Gets SDK info */
export function getSdkInfo(): SdkInfo {
  return {
    name: SDK_NAME,
    packages: [
      {
        name: 'npm:@sentry/electron',
        version: SDK_VERSION,
      },
    ],
    version: SDK_VERSION,
  };
}

/** Gets the default release name */
export function getDefaultReleaseName(): string {
  const app_name = app.name || app.getName();
  return `${app_name.replace(/\W/g, '-')}@${app.getVersion()}`;
}

/** Gets the default environment */
export function getDefaultEnvironment(): string {
  return app.isPackaged ? 'production' : 'development';
}

/** */
export async function getEventDefaults(client: NodeClient): Promise<Event> {
  let event: Event | null = { message: 'test' };
  const eventHint: EventHint = {};

  for (const processor of client.getEventProcessors()) {
    if (event === null) break;
    event = await processor(event, eventHint);
  }

  delete event?.message;

  return event || {};
}
