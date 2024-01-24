import { Event } from '@sentry/types';
import deepMerge from 'deepmerge';

/** Removes private properties from event before merging */
function removePrivateProperties(event: Event): void {
  for (const span of event.spans || []) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    delete (span as any).spanRecorder;
    // eslint-disable-next-line deprecation/deprecation
    delete span.transaction;
  }
}

/** Merges Events with defaults */
export function mergeEvents(defaults: Event, event: Event): Event {
  removePrivateProperties(event);

  const newEvent: Event = deepMerge(defaults, event);

  // We need to copy spans across manually
  //
  // Spans contain a custom toJSON function for serialization and without
  // this they are serialised with camelCase properties rather than the
  // snake_case required by the Sentry API.
  if (event.spans || defaults.spans) {
    newEvent.spans = event.spans || defaults.spans;
  }

  // We don't want packages array in sdk to get merged with duplicates
  return {
    ...newEvent,
    sdk: {
      ...defaults.sdk,
      ...event.sdk,
    },
  };
}
