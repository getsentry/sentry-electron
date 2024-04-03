import { defineIntegration } from '@sentry/core';
import { app } from 'electron';

import { normalizeEvent } from '../normalize';

export const normalizePathsIntegration = defineIntegration(() => {
  return {
    name: 'NormalizePaths',
    processEvent(event) {
      return normalizeEvent(event, app.getAppPath());
    },
  };
});
