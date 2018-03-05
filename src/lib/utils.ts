import { SentryEvent, Stacktrace } from '@sentry/core';
import { app, remote } from 'electron';

/** Application base path used for URL normalization. */
const APP_BASE_PATH = (app || remote.app).getAppPath().replace(/\\/g, '/');

/**
 * Normalizes URLs in exceptions and stacktraces so Sentry can fingerprint
 * across platforms.
 *
 * @param {string} url The URL to be normalized.
 * @param {string} [base=APP_BASE_PATH] (optional) The application base path.
 * @returns
 */
export function normalizeUrl(
  url: string,
  base: string = APP_BASE_PATH,
): string {
  return decodeURI(url)
    .replace(/\\/g, '/')
    .replace(new RegExp(`(file:\/\/)?\/*${base}\/*`, 'ig'), 'app:///');
}

/**
 * Normalizes all URLs in an event. See {@link normalizeUrl} for more
 * information.
 *
 * @param event The event to normalize.
 */
export function normalizeEvent(event: SentryEvent): SentryEvent {
  // NOTE: Events from Raven currently contain data that does not conform with
  // the `SentryEvent` interface. Until this has been resolved, we need to cast
  // to avoid typescript warnings.
  const internal = event as any;

  // The culprit has been deprecated about two years ago and can safely be
  // removed. Remove this line, once this has been resolved in Raven.
  delete internal.culprit;

  if (internal.request && internal.request.url) {
    internal.request.url = normalizeUrl(internal.request.url);
  }

  const stacktrace: Stacktrace =
    internal.stacktrace ||
    // Node exceptions
    (internal.exception &&
      internal.exception[0] &&
      internal.exception[0].stacktrace) ||
    // Browser exceptions
    (internal.exception && internal.exception.values[0].stacktrace);

  if (stacktrace && stacktrace.frames) {
    stacktrace.frames.forEach(frame => {
      if (frame.filename) {
        frame.filename = normalizeUrl(frame.filename);
      }
    });
  }

  return internal;
}
