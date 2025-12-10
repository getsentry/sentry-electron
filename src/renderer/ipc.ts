/* eslint-disable no-restricted-globals */
/* eslint-disable no-console */
import { Client, debug, getClient, SerializedLog, SerializedMetric, uuid4 } from '@sentry/core';
import { ipcChannelUtils, IPCInterface, RENDERER_ID_HEADER, RendererStatus } from '../common/ipc.js';
import { ElectronRendererOptionsInternal } from './sdk.js';

/** Gets the available IPC implementation */
function getImplementation(ipcKey: string): IPCInterface {
  const ipcUtil = ipcChannelUtils(ipcKey);

  // Favour IPC if it's been exposed by a preload script
  if (window.__SENTRY_IPC__?.[ipcUtil.namespace]) {
    return window.__SENTRY_IPC__[ipcUtil.namespace] as IPCInterface;
  } else {
    debug.log('IPC was not configured in preload script, falling back to custom protocol and fetch');

    // A unique ID used to identify this renderer and is send in the headers of every request
    // Because it added as a global, this can be fetched from the main process via executeJavaScript
    const id = (window.__SENTRY_RENDERER_ID__ = uuid4());
    const headers: Record<string, string> = { [RENDERER_ID_HEADER]: id };

    return {
      sendRendererStart: () => {
        fetch(ipcUtil.createUrl('start'), { method: 'POST', body: '', headers }).catch(() => {
          console.error(`Sentry SDK failed to establish connection with the Electron main process.
  - Ensure you have initialized the SDK in the main process
  - If your renderers use custom sessions, be sure to set 'getSessions' in the main process options
  - If you are bundling your main process code and using Electron < v5, you'll need to manually configure a preload script`);
        });
      },
      sendScope: (body: string) => {
        fetch(ipcUtil.createUrl('scope'), { method: 'POST', body, headers }).catch(() => {
          // ignore
        });
      },
      sendEnvelope: (body: string | Uint8Array) => {
        fetch(ipcUtil.createUrl('envelope'), { method: 'POST', body, headers }).catch(() => {
          // ignore
        });
      },
      sendStatus: (status: RendererStatus) => {
        fetch(ipcUtil.createUrl('status'), {
          method: 'POST',
          body: JSON.stringify({ status }),
          headers,
        }).catch(() => {
          // ignore
        });
      },
      sendStructuredLog: (log: SerializedLog) => {
        fetch(ipcUtil.createUrl('structured-log'), {
          method: 'POST',
          body: JSON.stringify(log),
          headers,
        }).catch(() => {
          // ignore
        });
      },
      sendMetric: (metric: SerializedMetric) => {
        fetch(ipcUtil.createUrl('metric'), {
          method: 'POST',
          body: JSON.stringify(metric),
          headers,
        }).catch(() => {
          // ignore
        });
      },
    };
  }
}

let cachedInterfaces: WeakMap<Client, IPCInterface> | undefined;

/**
 * Renderer IPC interface
 *
 * Favours IPC if its been exposed via a preload script but will
 * fallback to custom protocol and fetch if IPC is not available
 */
export function getIPC(client: Client | undefined = getClient()): IPCInterface {
  if (!client) {
    throw new Error('Could not find client, make sure to call Sentry.init before getIPC');
  }

  if (!cachedInterfaces) {
    cachedInterfaces = new WeakMap();
  }

  const found = cachedInterfaces.get(client);

  if (found) {
    return found;
  }

  const namespace = (client.getOptions() as ElectronRendererOptionsInternal).ipcNamespace;
  const implementation = getImplementation(namespace);
  cachedInterfaces.set(client, implementation);
  implementation.sendRendererStart();

  return implementation;
}
