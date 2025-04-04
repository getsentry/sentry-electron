/* eslint-disable complexity */
import { Event, Profile, ReplayEvent, Session } from '@sentry/core';

import { TestServerEvent } from '../server';

type EventOrSession = Event | Session;

export function normalize(event: TestServerEvent<Event | Session>): void {
  if (eventIsSession(event.data)) {
    normalizeSession(event.data as Session);
  } else {
    normalizeEvent(event.data as Event & ReplayEvent);
  }

  normalizeProfile(event.profile);

  if (event.metrics) {
    event.metrics = event.metrics.replace(/T\d{1,10}\n/g, 'T0000000000\n');
  }
}

export function eventIsSession(data: EventOrSession): boolean {
  return !!(data as Session)?.sid;
}

/**
 * Normalizes a session so that in can be compared to an expected event
 *
 * All properties that are timestamps, versions, ids or variables that may vary
 * by platform are replaced with placeholder strings
 */
function normalizeSession(session: Session): void {
  if (session.sid) {
    session.sid = '{{id}}';
  }

  if (session.started) {
    session.started = 0;
  }

  if (session.timestamp) {
    session.timestamp = 0;
  }

  if (session.duration) {
    session.duration = 0;
  }
}

/**
 * Normalizes an event so that in can be compared to an expected event
 *
 * All properties that are timestamps, versions, ids or variables that may vary
 * by platform are replaced with placeholder strings
 */
function normalizeEvent(event: Event & ReplayEvent): void {
  if (event.sdk?.version) {
    event.sdk.version = '{{version}}';
  }

  if (event?.sdk?.packages) {
    for (const pkg of event?.sdk?.packages || []) {
      if (pkg.version) {
        pkg.version = '{{version}}';
      }
    }
  }

  if (event.contexts?.app?.app_start_time) {
    event.contexts.app.app_start_time = '{{time}}';
  }

  // Windows e2e tests have two GPU contexts for some reason so we copy one over to the default
  if (event.contexts?.gpu_1) {
    event.contexts.gpu = event.contexts.gpu_1;
  }

  if (event.contexts?.gpu?.vendor_id) {
    event.contexts.gpu.vendor_id = '0x0000';
  }

  if (event.contexts?.gpu?.id) {
    event.contexts.gpu.id = '0x0000';
  }

  if (event.contexts?.chrome?.version) {
    event.contexts.chrome.version = '{{version}}';
  }

  if (event.contexts?.node?.version) {
    event.contexts.node.version = '{{version}}';
  }

  if (event.contexts?.runtime?.version) {
    event.contexts.runtime.version = '{{version}}';
  }

  if (event.contexts?.device?.arch) {
    event.contexts.device.arch = '{{arch}}';
  }

  if (event.contexts?.device?.memory_size) {
    event.contexts.device.memory_size = 0;
  }

  if (event.contexts?.device?.free_memory) {
    event.contexts.device.free_memory = 0;
  }

  if (event.contexts?.device?.processor_count) {
    event.contexts.device.processor_count = 0;
  }

  if (event.contexts?.device?.processor_frequency) {
    event.contexts.device.processor_frequency = 0;
  }

  if (event.contexts?.device?.cpu_description) {
    event.contexts.device.cpu_description = '{{cpu}}';
  }

  if (event.contexts?.device?.screen_resolution) {
    event.contexts.device.screen_resolution = '{{screen}}';
  }

  if (event.contexts?.device?.screen_density) {
    event.contexts.device.screen_density = 1;
  }

  if (event.contexts?.culture?.locale) {
    event.contexts.culture.locale = '{{locale}}';
  }

  if (event.contexts?.culture?.timezone) {
    event.contexts.culture.timezone = '{{timezone}}';
  }

  if (event.contexts?.os?.name) {
    event.contexts.os.name = '{{platform}}';
  }

  if (event.contexts?.os?.version) {
    event.contexts.os.version = '{{version}}';
  }

  if (event.contexts?.trace) {
    event.contexts.trace.span_id = '{{id}}';
    event.contexts.trace.trace_id = '{{id}}';
    delete event.contexts.trace.tags;
  }

  if (event?.tags?.replayId) {
    event.tags.replayId = '{{replay_id}}';
  }

  if (event?.request?.url) {
    // Strip Electron Forge arch from url
    event.request.url = event.request.url.replace(/\.webpack([\\/]).*?[\\/](renderer|main)/, '.webpack$1$2');
  }

  if (event.debug_meta?.images) {
    for (const image of event.debug_meta.images) {
      // Strip Electron Forge arch from url
      image.code_file = image.code_file?.replace(/\.webpack([\\/]).*?[\\/](renderer|main)/, '.webpack$1$2');
    }
  }

  if (event.replay_id) {
    event.replay_id = '{{id}}';
  }

  if ((event as any).replay_start_timestamp) {
    (event as any).replay_start_timestamp = 0;
  }

  if (Array.isArray(event.error_ids) && event.error_ids.length > 0) {
    event.error_ids = ['{{id}}'];
  }

  if (event.start_timestamp) {
    event.start_timestamp = 0;
  }

  if (event.exception?.values?.[0]?.stacktrace?.frames) {
    for (const frame of event.exception?.values?.[0].stacktrace?.frames || []) {
      frame.colno = 0;
      frame.lineno = 0;
      if (frame.function !== 'longWork') {
        frame.function = '{{function}}';
      }
      frame.filename = frame.filename
        ?.replace(/\.mjs$/, '.js')
        .replace(/\.webpack([\\/]).*?[\\/](renderer|main)/, '.webpack$1$2');
    }
  }

  if (event.timestamp) {
    event.timestamp = 0;
  }

  if ((event as any).start_timestamp) {
    (event as any).start_timestamp = 0;
  }

  if (event.event_id) {
    event.event_id = '{{id}}';
  }

  if (event.spans) {
    for (const span of event.spans) {
      const spanAny = span as any;

      if (spanAny.span_id) {
        spanAny.span_id = '{{id}}';
      }

      if (spanAny.parent_span_id) {
        spanAny.parent_span_id = '{{id}}';
      }

      if (spanAny.start_timestamp) {
        spanAny.start_timestamp = 0;
      }

      if (spanAny.timestamp) {
        spanAny.timestamp = 0;
      }

      if (spanAny.trace_id) {
        spanAny.trace_id = '{{id}}';
      }
    }
  }

  if (event.breadcrumbs) {
    for (const breadcrumb of event.breadcrumbs) {
      breadcrumb.timestamp = 0;
    }
  }
}

export function normalizeProfile(profile: Profile | undefined): void {
  if (!profile) {
    return;
  }

  profile.event_id = '{{id}}';
  profile.timestamp = '{{time}}';
}
