/* eslint-disable no-restricted-globals */
/* eslint-disable no-console */
import { logger, SerializedLog, uuid4 } from '@sentry/core';
import { IPCChannel, IPCInterface, PROTOCOL_SCHEME, RENDERER_ID_HEADER, RendererStatus } from '../common/ipc';

function buildUrl(channel: IPCChannel): string {
  // We include sentry_key in the URL so these don't end up in fetch breadcrumbs
  // https://github.com/getsentry/sentry-javascript/blob/a3f70d8869121183bec037571a3ee78efaf26b0b/packages/browser/src/integrations/breadcrumbs.ts#L240
  return `${PROTOCOL_SCHEME}://${channel}/sentry_key`;
}

/** Gets the available IPC implementation */
function getImplementation(): IPCInterface {
  // Favour IPC if it's been exposed by a preload script
  if (window.__SENTRY_IPC__) {
    return window.__SENTRY_IPC__;
  } else {
    logger.log('IPC was not configured in preload script, falling back to custom protocol and fetch');

    // A unique ID used to identify this renderer and is send in the headers of every request
    // Because it added as a global, this can be fetched from the main process via executeJavaScript
    const id = (window.__SENTRY_RENDERER_ID__ = uuid4());
    const headers: Record<string, string> = { [RENDERER_ID_HEADER]: id };

    return {
      sendRendererStart: () => {
        fetch(buildUrl(IPCChannel.RENDERER_START), { method: 'POST', body: '', headers }).catch(() => {
          console.error(`Sentry SDK failed to establish connection with the Electron main process.
  - Ensure you have initialized the SDK in the main process
  - If your renderers use custom sessions, be sure to set 'getSessions' in the main process options
  - If you are bundling your main process code and using Electron < v5, you'll need to manually configure a preload script`);
        });
      },
      sendScope: (body: string) => {
        fetch(buildUrl(IPCChannel.SCOPE), { method: 'POST', body, headers }).catch(() => {
          // ignore
        });
      },
      sendEnvelope: (body: string | Uint8Array) => {
        fetch(buildUrl(IPCChannel.ENVELOPE), { method: 'POST', body, headers }).catch(() => {
          // ignore
        });
      },
      sendStatus: (status: RendererStatus) => {
        fetch(buildUrl(IPCChannel.STATUS), { method: 'POST', body: JSON.stringify({ status }), headers }).catch(() => {
          // ignore
        });
      },
      sendStructuredLog: (log: SerializedLog) => {
        fetch(buildUrl(IPCChannel.STRUCTURED_LOG), {
          method: 'POST',
          body: JSON.stringify(log),
          headers,
        }).catch(() => {
          // ignore
        });
      },
    };
  }
}

let cachedInterface: IPCInterface | undefined;

/**
 * Renderer IPC interface
 *
 * Favours IPC if its been exposed via a preload script but will
 * fallback to custom protocol and fetch if IPC is not available
 */
export function getIPC(): IPCInterface {
  if (!cachedInterface) {
    cachedInterface = getImplementation();
    cachedInterface.sendRendererStart();
  }

  return cachedInterface;
}
