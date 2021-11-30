import { captureEvent, configureScope, Scope } from '@sentry/core';
import { Event } from '@sentry/types';
import { forget, logger, SentryError } from '@sentry/utils';
import { app, ipcMain, protocol, WebContents } from 'electron';

import { IPCChannel, IPCMode, mergeEvents, PROTOCOL_SCHEME } from '../common';
import { supportsFullProtocol, whenAppReady } from './electron-normalize';
import { ElectronMainOptions } from './sdk';

/**
 * Handle events from the renderer processes
 */
export function handleEvent(options: ElectronMainOptions, jsonEvent: string, contents?: WebContents): void {
  let event: Event;
  try {
    event = JSON.parse(jsonEvent) as Event;
  } catch {
    logger.warn('sentry-electron received an invalid event message');
    return;
  }

  const process = contents ? options?.getRendererName?.(contents) || `renderer` : 'renderer';

  captureEvent(mergeEvents(event, { tags: { 'event.process': process } }));
}

/** Is object defined and has keys */
function hasKeys(obj: any): boolean {
  return obj != undefined && Object.keys(obj).length > 0;
}

/**
 * Handle scope updates from renderer processes
 */
export function handleScope(options: ElectronMainOptions, jsonScope: string): void {
  let rendererScope: Scope;
  try {
    rendererScope = JSON.parse(jsonScope) as Scope;
  } catch {
    logger.warn('sentry-electron received an invalid scope message');
    return;
  }

  const sentScope = Scope.clone(rendererScope) as any;
  /* eslint-disable @typescript-eslint/no-unsafe-member-access */
  configureScope((scope) => {
    if (hasKeys(sentScope._user)) {
      scope.setUser(sentScope._user);
    }

    if (hasKeys(sentScope._tags)) {
      scope.setTags(sentScope._tags);
    }

    if (hasKeys(sentScope._extra)) {
      scope.setExtras(sentScope._extra);
    }

    scope.addBreadcrumb(sentScope._breadcrumbs.pop(), options?.maxBreadcrumbs || 100);
  });
  /* eslint-enable @typescript-eslint/no-unsafe-member-access */
}

/** Enables Electron protocol handling */
function configureProtocol(options: ElectronMainOptions): void {
  if (app.isReady()) {
    throw new SentryError("Sentry SDK should be initialized before the Electron app 'ready' event is fired");
  }

  protocol.registerSchemesAsPrivileged([
    {
      scheme: PROTOCOL_SCHEME,
      privileges: { bypassCSP: true, corsEnabled: true, supportFetchAPI: true },
    },
  ]);

  forget(
    whenAppReady.then(() => {
      for (const sesh of options.getSessions()) {
        sesh.protocol.registerStringProtocol(PROTOCOL_SCHEME, (request, callback) => {
          const data = request.uploadData?.[0]?.bytes.toString();

          if (request.url.startsWith(`${PROTOCOL_SCHEME}://${IPCChannel.EVENT}`) && data) {
            handleEvent(options, data);
          } else if (request.url.startsWith(`${PROTOCOL_SCHEME}://${IPCChannel.SCOPE}`) && data) {
            handleScope(options, data);
          }

          callback({ data: '', headers: { 'Access-Control-Allow-Origin': '*' } });
        });
      }
    }),
  );
}

/**
 * Hooks IPC for communication with the renderer processes
 */
function configureClassic(options: ElectronMainOptions): void {
  ipcMain.on(IPCChannel.EVENT, ({ sender }, jsonEvent: string) => handleEvent(options, jsonEvent, sender));
  ipcMain.on(IPCChannel.SCOPE, (_, jsonScope: string) => handleScope(options, jsonScope));
}

/** Sets up communication channels with the renderer */
export function configureIPC(options: ElectronMainOptions): void {
  if (!supportsFullProtocol() && options.ipcMode === IPCMode.Protocol) {
    throw new SentryError('IPCMode.Protocol is only supported in Electron >= v5');
  }

  // eslint-disable-next-line no-bitwise
  if (supportsFullProtocol() && (options.ipcMode & IPCMode.Protocol) > 0) {
    configureProtocol(options);
  }

  // eslint-disable-next-line no-bitwise
  if ((options.ipcMode & IPCMode.Classic) > 0) {
    configureClassic(options);
  }
}
