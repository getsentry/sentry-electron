import { defineIntegration, Event, forEachEnvelopeItem, LRUMap, Profile } from '@sentry/core';
import { app } from 'electron';
import { getDefaultEnvironment, getDefaultReleaseName } from '../context';
import { addHeaderToSession } from '../header-injection';
import { normaliseProfile } from '../normalize';
import { ElectronMainOptionsInternal } from '../sdk';

// A cache of renderer profiles which need attaching to events
let RENDERER_PROFILES: LRUMap<string, Profile> | undefined;

/**
 * Caches a profile to later be re-attached to an event
 */
export function rendererProfileFromIpc(event: Event, profile: Profile): void {
  if (!RENDERER_PROFILES) {
    return;
  }

  const profile_id = profile.event_id;
  RENDERER_PROFILES.set(profile_id, profile);

  if (event) {
    event.contexts = {
      ...event.contexts,
      // Re-add the profile context which we can later use to find the correct profile
      profile: {
        profile_id,
      },
    };
  }
}

/**
 * Injects 'js-profiling' document policy headers and ensures that profiles get forwarded with transactions
 */
export const rendererProfilingIntegration = defineIntegration(() => {
  return {
    name: 'RendererProfiling',
    setup(client) {
      const options = client.getOptions() as ElectronMainOptionsInternal;
      if (!options.enableRendererProfiling) {
        return;
      }

      RENDERER_PROFILES = new LRUMap(10);

      app.on('ready', () => {
        // Ensure the correct headers are set to enable the browser profiler
        options.getSessions().forEach((sesh) => addHeaderToSession(sesh, 'Document-Policy', 'js-profiling'));
      });

      // Copy the profiles back into the event envelopes
      client.on?.('beforeEnvelope', (envelope) => {
        let profile_id: string | undefined;

        forEachEnvelopeItem(envelope, (item, type) => {
          if (type !== 'transaction') {
            return;
          }

          for (let j = 1; j < item.length; j++) {
            const event = item[j] as Event;

            if (event?.contexts?.profile?.profile_id) {
              profile_id = event.contexts.profile.profile_id as string;
              // This can be removed as it's no longer needed
              delete event.contexts.profile;
            }
          }
        });

        if (!profile_id) {
          return;
        }

        const profile = RENDERER_PROFILES?.remove(profile_id);

        if (!profile) {
          return;
        }

        normaliseProfile(profile, app.getAppPath());
        profile.release = options.release || getDefaultReleaseName();
        profile.environment = options.environment || getDefaultEnvironment();

        // @ts-expect-error untyped envelope
        envelope[1].push([{ type: 'profile' }, profile]);
      });
    },
  };
});
