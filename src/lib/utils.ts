import { SentryEvent, Stacktrace } from '@sentry/core';
import { app, remote } from 'electron';

/** Application base path used for URL normalization. */
const APP_PATH = (app || remote.app).getAppPath().replace(/\\/g, '/');

/** Helper to filter an array with asynchronous callbacks. */
export async function filterAsync<T>(
  array: T[],
  predicate: (item: T) => Promise<boolean>,
  thisArg?: any,
): Promise<T[]> {
  const verdicts = await Promise.all(array.map(predicate, thisArg));
  return array.filter((_, index) => verdicts[index]);
}

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
  const copy = JSON.parse(JSON.stringify(event));

  // The culprit has been deprecated about two years ago and can safely be
  // removed. Remove this line, once this has been resolved in Raven.
  delete copy.culprit;

  if (copy.request && copy.request.url) {
    copy.request.url = normalizeUrl(copy.request.url);
  }

  const stacktrace: Stacktrace =
    copy.stacktrace ||
    // Node exceptions
    (copy.exception && copy.exception[0] && copy.exception[0].stacktrace) ||
    // Browser exceptions
    (copy.exception && copy.exception.values[0].stacktrace);

  if (stacktrace && stacktrace.frames) {
    stacktrace.frames.forEach(frame => {
      if (frame.filename) {
        frame.filename = normalizeUrl(frame.filename);
      }
    });
  }

  return copy;
}
