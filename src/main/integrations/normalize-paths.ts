import type { Profile, ProfileChunk } from '@sentry/core';
import { defineIntegration, forEachEnvelopeItem, normalizeUrlToBase } from '@sentry/core';
import { app } from 'electron';
import { normaliseProfile, normaliseProfileChunk, normalizePaths } from '../normalize.js';
import type { ElectronMainOptionsInternal } from '../sdk.js';

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
            } else if (type === 'profile_chunk') {
              // Chunks from `@sentry/profiling-node` only reach this hook once
              // https://github.com/getsentry/sentry-javascript/pull/24896 is released
              normaliseProfileChunk(
                item[1] as ProfileChunk,
                app.getAppPath(),
                client.getOptions() as ElectronMainOptionsInternal,
              );
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
