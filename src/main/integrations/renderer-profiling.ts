import { NodeClient } from '@sentry/node';
import { Event, Integration, Profile } from '@sentry/types';
import { forEachEnvelopeItem, LRUMap } from '@sentry/utils';
import { app } from 'electron';

import { normaliseProfile } from '../../common';
import { getDefaultEnvironment, getDefaultReleaseName } from '../context';
import { ELECTRON_MAJOR_VERSION } from '../electron-normalize';
import { ElectronMainOptionsInternal } from '../sdk';

const DOCUMENT_POLICY_HEADER = 'Document-Policy';
const JS_PROFILING_HEADER = 'js-profiling';

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

function addJsProfilingHeader(
  responseHeaders: Record<string, string | string[]> = {},
): Electron.HeadersReceivedResponse {
  if (responseHeaders[DOCUMENT_POLICY_HEADER]) {
    const docPolicy = responseHeaders[DOCUMENT_POLICY_HEADER];

    if (Array.isArray(docPolicy)) {
      docPolicy.push(JS_PROFILING_HEADER);
    } else {
      responseHeaders[DOCUMENT_POLICY_HEADER] = [docPolicy, JS_PROFILING_HEADER];
    }
  } else {
    responseHeaders[DOCUMENT_POLICY_HEADER] = JS_PROFILING_HEADER;
  }

  return { responseHeaders };
}

/**
 * Injects 'js-profiling' document policy headers and ensures that profiles get forwarded with transactions
 */
export class RendererProfiling implements Integration {
  /** @inheritDoc */
  public static id: string = 'RendererProfiling';

  /** @inheritDoc */
  public readonly name: string;

  public constructor() {
    this.name = RendererProfiling.id;
  }

  /** @inheritDoc */
  public setupOnce(): void {
    //
  }

  /** @inheritDoc */
  public setup(client: NodeClient): void {
    const options = client.getOptions() as ElectronMainOptionsInternal;
    if (!options.enableRendererProfiling) {
      return;
    }

    if (ELECTRON_MAJOR_VERSION < 15) {
      throw new Error('Renderer profiling requires Electron 15+ (Chromium 94+)');
    }

    RENDERER_PROFILES = new LRUMap(10);

    app.on('ready', () => {
      // Ensure the correct headers are set to enable the browser profiler
      for (const sesh of options.getSessions()) {
        sesh.webRequest.onHeadersReceived((details, callback) => {
          callback(addJsProfilingHeader(details.responseHeaders));
        });
      }
    });

    // Copy the profiles back into the event envelopes
    client.on('beforeEnvelope', (envelope) => {
      let profile_id: string | undefined;

      forEachEnvelopeItem(envelope, (item, type) => {
        if (type !== 'transaction') {
          return;
        }

        for (let j = 1; j < item.length; j++) {
          const event = item[j] as Event;

          if (event && event.contexts && event.contexts.profile && event.contexts.profile.profile_id) {
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
  }
}
