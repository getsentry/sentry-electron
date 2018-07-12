import { SentryEvent, SentryException, Stacktrace } from '@sentry/types';
import { clone } from '@sentry/utils/object';
// tslint:disable-next-line:no-implicit-dependencies
import { app } from 'electron';

/** Application base path used for URL normalization. */
const APP_PATH = app.getAppPath().replace(/\\/g, '/');

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
    // Raven Node adheres to the Event interface
    // @ts-ignore
    if (exception[0]) {
      // @ts-ignore
      // tslint:disable-next-line:no-unsafe-any
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
 * information. Mutates the passed in event.
 *
 * @param event The event to normalize.
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

  const { request = {} } = copy;
  if (request.url) {
    request.url = normalizeUrl(request.url);
  }

  // The user agent is parsed by Sentry and would overwrite certain context
  // information, which we don't want. Generally remove it, since we know that
  // we are browsing with Chrome.
  if (request.headers) {
    delete request.headers['User-Agent'];
  }

  // The Node SDK currently adds a default tag for server_name, which contains
  // the machine name of the computer running Electron. This is not useful
  // information in this case.
  const { tags = {} } = copy;
  delete tags.server_name;
  return copy;
}
