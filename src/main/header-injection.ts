import { Session } from 'electron';

function addHeader(
  responseHeaders: Record<string, string | string[]> = {},
  name: string,
  value: string,
): Electron.HeadersReceivedResponse {
  if (responseHeaders[name]) {
    const existing = responseHeaders[name];

    if (Array.isArray(existing)) {
      existing.push(value);
    } else {
      responseHeaders[name] = [existing, value];
    }
  } else {
    responseHeaders[name] = value;
  }

  return { responseHeaders };
}

/**
 * Adds a header to a session's web request
 */
export function addHeaderToSession(sesh: Session, header: string, value: string): void {
  sesh.webRequest.onHeadersReceived((details, callback) => {
    callback(addHeader(details.responseHeaders, header, value));
  });
}
