import { defineIntegration } from '@sentry/core';
import { app } from 'electron';

import { normalizePaths } from '../normalize';

export const normalizePathsIntegration = defineIntegration(() => {
  return {
    name: 'NormalizePaths',
    processEvent(event) {
      return normalizePaths(event, app.getAppPath());
    },
  };
});
