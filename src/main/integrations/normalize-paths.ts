import { defineIntegration, forEachEnvelopeItem, Profile } from '@sentry/core';
import { app } from 'electron';
import { normaliseProfile, normalizePaths } from '../normalize.js';

export const normalizePathsIntegration = defineIntegration(() => {
  return {
    name: 'NormalizePaths',
    setup: (client) => {
      // We want this hook to be registered after the profiling-node hook so we can normalise the profile after it's
      // been attached
      setImmediate(() => {
        client.on('beforeEnvelope', (envelope) => {
          forEachEnvelopeItem(envelope, (item, type) => {
            if (type === 'profile') {
              normaliseProfile(item[1] as Profile, app.getAppPath());
            }
          });
        });
      });
    },
    processEvent(event) {
      return normalizePaths(event, app.getAppPath());
    },
  };
});
