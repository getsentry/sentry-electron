import { defineIntegration } from '@sentry/core';
import { app } from 'electron';

import { getEventDefaults } from '../context';
import { mergeEvents } from '../merge';
import { normalizeEvent } from '../normalize';

/** Adds Electron context to events and normalises paths. */
export const mainContextIntegration = defineIntegration(() => {
  return {
    name: 'MainContext',
    async processEvent(event, _, client) {
      const clientOptions = client.getOptions();
      const normalized = normalizeEvent(event, app.getAppPath());
      const defaults = await getEventDefaults(clientOptions.release, clientOptions.environment);
      return mergeEvents(defaults, normalized);
    },
  };
});
