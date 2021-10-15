import { Event, Session } from '@sentry/types';

type EventOrSession = Event | Session;

export function normalize(event: EventOrSession): EventOrSession {
  if (eventIsSession(event)) {
    throw new Error('Not implemented');
  } else {
    return normalizeEvent(event as Event);
  }
}

export function eventIsSession(data: EventOrSession): boolean {
  return !!(data as Session)?.sid;
}

/**
 * Normalizes an event so that in can be compared to an expected event
 *
 * All properties that are timestamps, versions, ids or variables that may vary
 * by platform are replaced with placeholder strings
 */
export function normalizeEvent(event: Event): Event {
  if (event.sdk?.version) {
    event.sdk.version = '{{version}}';
  }

  if (event?.sdk?.packages?.[0].version) {
    event.sdk.packages[0].version = '{{version}}';
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

  if (event.start_timestamp) {
    event.start_timestamp = 0;
  }

  if (event.exception?.values?.[0].stacktrace?.frames) {
    for (const frame of event.exception?.values?.[0].stacktrace?.frames) {
      frame.colno = 0;
      frame.lineno = 0;
      frame.function = '{{function}}';
    }
  }

  event.timestamp = 0;
  if ((event as any).start_timestamp) {
    (event as any).start_timestamp = 0;
  }

  event.event_id = '{{id}}';

  if (event.spans) {
    for (const span of event.spans) {
      const spanAny = span as any;
      spanAny.span_id = '{{id}}';
      spanAny.parent_span_id = '{{id}}';
      spanAny.start_timestamp = 0;
      spanAny.timestamp = 0;
      spanAny.trace_id = '{{id}}';
    }
  }

  if (event.breadcrumbs) {
    for (const breadcrumb of event.breadcrumbs) {
      breadcrumb.timestamp = 0;
    }
  }

  return event;
}
