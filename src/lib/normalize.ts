import { SentryEvent, SentryException, Stacktrace } from '@sentry/core';
import { clone, getApp } from './utils';

/** Application base path used for URL normalization. */
const APP_PATH = getApp()
  .getAppPath()
  .replace(/\\/g, '/');

/**
 * Normalizes URLs in exceptions and stacktraces so Sentry can fingerprint
 * across platforms.
 *
 * @param url The URL to be normalized.
 * @param base (optional) The application base path.
 * @returns The normalized URL.
 */
export function normalizeUrl(url: string, base: string = APP_PATH): string {
  return decodeURI(url)
    .replace(/\\/g, '/')
    .replace(new RegExp(`(file:\/\/)?\/*${base}\/*`, 'ig'), 'app:///');
}

/**
 * Returns a reference to the exception stack trace in the given event.
 * @param event An event potentially containing stack traces.
 */
function getStacktrace(event: SentryEvent): Stacktrace | undefined {
  const { stacktrace, exception } = event;

  // Try the main event stack trace first
  if (stacktrace) {
    return stacktrace;
  }

  if (exception) {
    // Raven Node adhers to the Event interface
    if (exception[0]) {
      return exception[0].stacktrace;
    }

    // Raven JS uses the full values interface, which has been removed
    const raven = (exception as any) as { values: SentryException[] };
    if (raven.values && raven.values[0]) {
      return raven.values[0].stacktrace;
    }
  }

  return undefined;
}

/**
 * Normalizes all URLs in an event. See {@link normalizeUrl} for more
 * information.
 *
 * @param event The event to normalize.
 * @returns The normalized event.
 */
export function normalizeEvent(event: SentryEvent): SentryEvent {
  // NOTE: Events from Raven currently contain data that does not conform with
  // the `SentryEvent` interface. Until this has been resolved, we need to cast
  // to avoid typescript warnings.
  const copy = clone(event);

  // The culprit has been deprecated about two years ago and can safely be
  // removed. Remove this line, once this has been resolved in Raven.
  delete (copy as { culprit: string }).culprit;

  // Retrieve stack traces and normalize their URLs. Without this, grouping
  // would not work due to user folders in file names.
  const stacktrace = getStacktrace(copy);
  if (stacktrace && stacktrace.frames) {
    stacktrace.frames.forEach(frame => {
      if (frame.filename) {
        frame.filename = normalizeUrl(frame.filename);
      }
    });
  }

  return copy;
}
