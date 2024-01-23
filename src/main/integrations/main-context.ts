import { convertIntegrationFnToClass } from '@sentry/core';
import { IntegrationFn } from '@sentry/types';
import { app } from 'electron';

import { mergeEvents, normalizeEvent } from '../../common';
import { getEventDefaults } from '../context';

const INTEGRATION_NAME = 'MainContext';

const mainContext: IntegrationFn = () => {
  return {
    name: INTEGRATION_NAME,
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
};

/** Adds Electron context to events and normalises paths. */
// eslint-disable-next-line deprecation/deprecation
export const MainContext = convertIntegrationFnToClass(INTEGRATION_NAME, mainContext);
