/**
 * This preload script may be used with sandbox mode enabled which means regular require is not available.
 */

import { contextBridge, ipcRenderer } from 'electron';

import { IPCChannel, MetricIPCMessage, RendererStatus } from '../common/ipc';

// eslint-disable-next-line no-restricted-globals
if (window.__SENTRY_IPC__) {
  // eslint-disable-next-line no-console
  console.log('Sentry Electron preload has already been run');
} else {
  const ipcObject = {
    sendRendererStart: () => ipcRenderer.send(IPCChannel.RENDERER_START),
    sendScope: (scopeJson: string) => ipcRenderer.send(IPCChannel.SCOPE, scopeJson),
    sendEvent: (eventJson: string) => ipcRenderer.send(IPCChannel.EVENT, eventJson),
    sendEnvelope: (envelope: Uint8Array | string) => ipcRenderer.send(IPCChannel.ENVELOPE, envelope),
    sendStatus: (status: RendererStatus) => ipcRenderer.send(IPCChannel.STATUS, status),
    sendAddMetric: (metric: MetricIPCMessage) => ipcRenderer.send(IPCChannel.ADD_METRIC, metric),
  };

  // eslint-disable-next-line no-restricted-globals
  window.__SENTRY_IPC__ = ipcObject;

  // We attempt to use contextBridge if it's available
  if (contextBridge) {
    // This will fail if contextIsolation is not enabled
    try {
      contextBridge.exposeInMainWorld('__SENTRY_IPC__', ipcObject);
    } catch (e) {
      //
    }
  }
}
