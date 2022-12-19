/* eslint-disable no-restricted-globals */
/* eslint-disable no-console */
import { logger } from '@sentry/utils';

import { IPCChannel, IPCInterface, PROTOCOL_SCHEME } from '../common';

/** Gets the available IPC implementation */
function getImplementation(): IPCInterface {
  // Favour IPC if it's been exposed by a preload script
  if (window.__SENTRY_IPC__) {
    return window.__SENTRY_IPC__;
  }

  logger.log('IPC was not configured in preload script, falling back to custom protocol and fetch');

  fetch(`${PROTOCOL_SCHEME}://${IPCChannel.PING}/sentry_key`).catch(() =>
    console.error(`Sentry SDK failed to establish connection with the Electron main process.
 - Ensure you have initialized the SDK in the main process
 - If your renderers use custom sessions, be sure to set 'getSessions' in the main process options
 - If you are bundling your main process code and using Electron < v5, you'll need to manually configure a preload script`),
  );

  // We include sentry_key in the URL so these dont end up in fetch breadcrumbs
  // https://github.com/getsentry/sentry-javascript/blob/a3f70d8869121183bec037571a3ee78efaf26b0b/packages/browser/src/integrations/breadcrumbs.ts#L240
  return {
    sendScope: (body) => {
      fetch(`${PROTOCOL_SCHEME}://${IPCChannel.SCOPE}/sentry_key`, { method: 'POST', body }).catch(() => {
        // ignore
      });
    },
    sendEvent: (body) => {
      fetch(`${PROTOCOL_SCHEME}://${IPCChannel.EVENT}/sentry_key`, { method: 'POST', body }).catch(() => {
        // ignore
      });
    },
    sendEnvelope: (body) => {
      fetch(`${PROTOCOL_SCHEME}://${IPCChannel.ENVELOPE}/sentry_key`, { method: 'POST', body }).catch(() => {
        // ignore
      });
    },
  };
}

let cachedInterface: IPCInterface | undefined;

/**
 * Renderer IPC interface
 *
 * Favours IPC if its been exposed via a preload script but will
 * fallback to custom protocol and fetch is IPC is not available
 */
export function getIPC(): IPCInterface {
  if (!cachedInterface) {
    cachedInterface = getImplementation();
  }

  return cachedInterface;
}
