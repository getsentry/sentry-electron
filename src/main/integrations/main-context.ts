import { defineIntegration } from '@sentry/core';
import { app } from 'electron';

import { mergeEvents, normalizeEvent } from '../../common';
import { getEventDefaults } from '../context';

/** Adds Electron context to events and normalises paths. */
export const mainContextIntegration = defineIntegration(() => {
  return {
    name: 'MainContext',
    setupOnce() {
      // noop
    },
    async processEvent(event, _, client) {
      const clientOptions = client.getOptions();
      const normalized = normalizeEvent(event, app.getAppPath());
      const defaults = await getEventDefaults(clientOptions.release, clientOptions.environment);
      return mergeEvents(defaults, normalized);
    },
  };
});
