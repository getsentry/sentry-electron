import { Envelope, Event, ReplayEvent } from '@sentry/types';
import { addItemToEnvelope, createEnvelope, forEachEnvelopeItem } from '@sentry/utils';

/**
 * Normalizes URLs in exceptions and stacktraces so Sentry can fingerprint
 * across platforms.
 *
 * @param url The URL to be normalized.
 * @param basePath The application base path.
 * @returns The normalized URL.
 */
export function normalizeUrl(url: string, basePath: string): string {
  const escapedBase = basePath
    // Backslash to forward
    .replace(/\\/g, '/')
    // Escape RegExp special characters
    .replace(/[|\\{}()[\]^$+*?.]/g, '\\$&');

  let newUrl = url;
  try {
    newUrl = decodeURI(url);
  } catch (_Oo) {
    // Sometime this breaks
  }
  return newUrl
    .replace(/\\/g, '/')
    .replace(/webpack:\/?/g, '') // Remove intermediate base path
    .replace(new RegExp(`(file://)?/*${escapedBase}/*`, 'ig'), 'app:///');
}

/**
 * Normalizes all URLs in an event. See {@link normalizeUrl} for more
 * information. Mutates the passed in event.
 *
 * @param event The event to normalize.
 */
export function normalizeEvent(event: Event, basePath: string): Event {
  // Retrieve stack traces and normalize their paths. Without this, grouping
  // would not work due to usernames in file paths.
  for (const exception of event.exception?.values || []) {
    for (const frame of exception.stacktrace?.frames || []) {
      if (frame.filename) {
        frame.filename = normalizeUrl(frame.filename, basePath);
      }
    }
  }

  // We need to normalize debug ID images the same way as the stack frames for symbolicator to match them correctly
  for (const debugImage of event.debug_meta?.images || []) {
    if (debugImage.type === 'sourcemap') {
      debugImage.code_file = normalizeUrl(debugImage.code_file, basePath);
    }
  }

  if (event.transaction) {
    event.transaction = normalizeUrl(event.transaction, basePath);
  }

  const { request = {} } = event;
  if (request.url) {
    request.url = normalizeUrl(request.url, basePath);
  }

  event.contexts = {
    ...event.contexts,
    runtime: {
      name: 'Electron',
      version: process.versions.electron,
    },
  };

  // The user agent is parsed by Sentry and would overwrite certain context
  // information, which we don't want. Generally remove it, since we know that
  // we are browsing with Chrome.
  if (request.headers) {
    delete request.headers['User-Agent'];
  }

  // The Node SDK includes server_name, which contains the machine name of the computer running Electron.
  // In this case this is likely to include PII.
  const { tags = {} } = event;
  delete tags.server_name;
  delete event.server_name;
  return event;
}

/** Normalizes URLs in any replay_event items found in an envelope */
export function normalizeUrlsInReplayEnvelope(envelope: Envelope, basePath: string): Envelope {
  let modifiedEnvelope = createEnvelope(envelope[0]);

  let isReplay = false;

  forEachEnvelopeItem(envelope, (item, type) => {
    if (type === 'replay_event') {
      isReplay = true;
      const [headers, event] = item as [{ type: 'replay_event' }, ReplayEvent];

      if (Array.isArray(event.urls)) {
        event.urls = event.urls.map((url) => normalizeUrl(url, basePath));
      }

      if (event?.request?.url) {
        event.request.url = normalizeUrl(event.request.url, basePath);
      }

      modifiedEnvelope = addItemToEnvelope(modifiedEnvelope, [headers, event]);
    } else if (type === 'replay_recording') {
      modifiedEnvelope = addItemToEnvelope(modifiedEnvelope, item);
    }
  });

  return isReplay ? modifiedEnvelope : envelope;
}
