/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Event } from '@sentry/types';
import * as deepMerge from 'deepmerge';

/** Removes private properties fro event before merging */
function removePrivateProperties(event: Event): void {
  for (const span of event.spans || []) {
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
