/**
 * This preload script may be used with sandbox mode enabled which means regular require is not available.
 */

import { SerializedLog } from '@sentry/core';
import { contextBridge, ipcRenderer } from 'electron';
import { IPCChannel, RendererStatus } from '../common/ipc.js';

// eslint-disable-next-line no-restricted-globals
if (window.__SENTRY_IPC__) {
  // eslint-disable-next-line no-console
  console.log('Sentry Electron preload has already been run');
} else {
  const ipcObject = {
    sendRendererStart: () => ipcRenderer.send(IPCChannel.RENDERER_START),
    sendScope: (scopeJson: string) => ipcRenderer.send(IPCChannel.SCOPE, scopeJson),
    sendEnvelope: (envelope: Uint8Array | string) => ipcRenderer.send(IPCChannel.ENVELOPE, envelope),
    sendStatus: (status: RendererStatus) => ipcRenderer.send(IPCChannel.STATUS, status),
    sendStructuredLog: (log: SerializedLog) => ipcRenderer.send(IPCChannel.STRUCTURED_LOG, log),
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
