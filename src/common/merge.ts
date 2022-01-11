import { Event } from '@sentry/types';
// import * as deepmerge does not work with ES modules
const deepMerge = require('deepmerge');

/** Removes private properties from event before merging */
function removePrivateProperties(event: Event): void {
  for (const span of event.spans || []) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    delete (span as any).spanRecorder;
    delete span.transaction;
  }
}

/** Merges Events with defaults */
export function mergeEvents(defaults: Event, event: Event): Event {
  removePrivateProperties(event);

  const newEvent = deepMerge(defaults, event);

  // We don't want packages array in sdk to get merged with duplicates
  return {
    ...newEvent,
    sdk: {
      ...defaults.sdk,
      ...event.sdk,
    },
  };
}
