import type { Profile } from '@sentry/core';
import { defineIntegration, forEachEnvelopeItem, normalizeUrlToBase } from '@sentry/core';
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
    // All spans pass through this hook, including segment spans
    processSpan(span) {
      span.name = normalizeUrlToBase(span.name, app.getAppPath());

      // Child spans hold the segment name in an attribute which is serialized before the segment
      // span itself is normalized above
      const segmentName = span.attributes?.['sentry.segment.name'];
      if (span.attributes && typeof segmentName === 'string') {
        span.attributes['sentry.segment.name'] = normalizeUrlToBase(segmentName, app.getAppPath());
      }
    },
  };
});
