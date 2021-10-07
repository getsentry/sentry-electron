import { Event } from '@sentry/types';
import * as deepMerge from 'deepmerge';

/** Merges Events with defaults */
export function mergeEvents(defaults: Event, event: Event): Event {
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
