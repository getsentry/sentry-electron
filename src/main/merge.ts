import { Event } from '@sentry/core';

/** Removes private properties from event before merging */
function removePrivateProperties(event: Event): void {
  // These contain recursive structures and are not meant to be serialized
  delete event.sdkProcessingMetadata?.capturedSpanScope;
  delete event.sdkProcessingMetadata?.capturedSpanIsolationScope;

  for (const span of event.spans || []) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    delete (span as any).spanRecorder;
  }
}

/** Merges Events with defaults */
export function mergeEvents(defaults: Event, event: Event): Event {
  removePrivateProperties(event);

  const newEvent: Event = {
    ...defaults,
    ...event,
    contexts: {
      ...defaults.contexts,
      ...event.contexts,
      app: {
        ...defaults.contexts?.app,
        ...event.contexts?.app,
      },
      device: {
        ...defaults.contexts?.device,
        ...event.contexts?.device,
      },
    },
    tags: {
      ...defaults.tags,
      ...event.tags,
    },
    sdk: {
      ...defaults.sdk,
      ...event.sdk,
    },
  };

  if (defaults.extra || event.extra) {
    newEvent.extra = {
      ...defaults.extra,
      ...event.extra,
    };
  }

  return newEvent;
}
