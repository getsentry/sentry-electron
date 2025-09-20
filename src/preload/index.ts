/**
 * This preload script may be used with sandbox mode enabled which means regular require is not available.
 */

import { SerializedLog } from '@sentry/core';
import { contextBridge, ipcRenderer } from 'electron';
import { ipcChannelUtils, RendererStatus } from '../common/ipc.js';

/**
 * Hook up IPC to the window object and uses contextBridge if available.
 *
 * @param namespace An optional namespace to use for the IPC channels
 */
export function hookupIpc(namespace: string = 'sentry-ipc'): void {
  const ipcUtil = ipcChannelUtils(namespace);

  // eslint-disable-next-line no-restricted-globals
  window.__SENTRY_IPC__ = window.__SENTRY_IPC__ || {};

  // eslint-disable-next-line no-restricted-globals
  if (window.__SENTRY_IPC__[ipcUtil.namespace]) {
    // eslint-disable-next-line no-console
    console.log('Sentry Electron preload has already been run');
  } else {
    const ipcObject = {
      sendRendererStart: () => ipcRenderer.send(ipcUtil.createKey('start')),
      sendScope: (scopeJson: string) => ipcRenderer.send(ipcUtil.createKey('scope'), scopeJson),
      sendEnvelope: (envelope: Uint8Array | string) => ipcRenderer.send(ipcUtil.createKey('envelope'), envelope),
      sendStatus: (status: RendererStatus) => ipcRenderer.send(ipcUtil.createKey('status'), status),
      sendStructuredLog: (log: SerializedLog) => ipcRenderer.send(ipcUtil.createKey('structured-log'), log),
    };

    // eslint-disable-next-line no-restricted-globals
    window.__SENTRY_IPC__[ipcUtil.namespace] = ipcObject;

    // We attempt to use contextBridge if it's available
    if (contextBridge) {
      // This will fail if contextIsolation is not enabled
      try {
        // eslint-disable-next-line no-restricted-globals
        contextBridge.exposeInMainWorld('__SENTRY_IPC__', window.__SENTRY_IPC__);
      } catch (e) {
        //
      }
    }
  }
}
