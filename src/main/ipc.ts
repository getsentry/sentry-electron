import { captureEvent, configureScope, Scope } from '@sentry/core';
import { Event, EventHint } from '@sentry/types';
import { logger, SentryError } from '@sentry/utils';
import { app, ipcMain, protocol, WebContents } from 'electron';

import { IPCChannel, IPCMode, mergeEvents, PROTOCOL_SCHEME } from '../common';
import { supportsFullProtocol, whenAppReady } from './electron-normalize';
import { ElectronMainOptionsInternal } from './sdk';

function parse<T>(ty: string, json: string): T | undefined {
  try {
    return JSON.parse(json) as T;
  } catch {
    logger.warn(`sentry-electron received an invalid ${ty} message`);
    return;
  }
}

/**
 * Handle events from the renderer processes
 */
export function handleEvent(options: ElectronMainOptionsInternal, json: string, contents?: WebContents): void {
  const eventAndHint = parse<[Event, EventHint]>('event', json);

  if (eventAndHint) {
    const process = contents ? options?.getRendererName?.(contents) || 'renderer' : 'renderer';

    const [event, hint] = eventAndHint;
    captureEvent(mergeEvents(event, { tags: { 'event.process': process } }), hint);
  }
}

/** Is object defined and has keys */
function hasKeys(obj: any): boolean {
  return obj != undefined && Object.keys(obj).length > 0;
}

/**
 * Handle scope updates from renderer processes
 */
export function handleScope(options: ElectronMainOptionsInternal, json: string): void {
  const rendererScope = parse<Scope>('scope', json);

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

    const breadcrumb = sentScope._breadcrumbs.pop();
    if (breadcrumb) {
      scope.addBreadcrumb(breadcrumb, options?.maxBreadcrumbs || 100);
    }
  });
  /* eslint-enable @typescript-eslint/no-unsafe-member-access */
}

/** Enables Electron protocol handling */
function configureProtocol(options: ElectronMainOptionsInternal): void {
  if (app.isReady()) {
    throw new SentryError("Sentry SDK should be initialized before the Electron app 'ready' event is fired");
  }

  protocol.registerSchemesAsPrivileged([
    {
      scheme: PROTOCOL_SCHEME,
      privileges: { bypassCSP: true, corsEnabled: true, supportFetchAPI: true },
    },
  ]);

  whenAppReady
    .then(() => {
      for (const sesh of options.getSessions()) {
        sesh.protocol.registerStringProtocol(PROTOCOL_SCHEME, (request, callback) => {
          const data = request.uploadData?.[0]?.bytes.toString();

          if (request.url.startsWith(`${PROTOCOL_SCHEME}://${IPCChannel.EVENT}`) && data) {
            handleEvent(options, data);
          } else if (request.url.startsWith(`${PROTOCOL_SCHEME}://${IPCChannel.SCOPE}`) && data) {
            handleScope(options, data);
          }

          callback('');
        });
      }
    })
    .catch((error) => logger.error(error));
}

/**
 * Hooks IPC for communication with the renderer processes
 */
function configureClassic(options: ElectronMainOptionsInternal): void {
  ipcMain.on(IPCChannel.EVENT, ({ sender }, json: string) => handleEvent(options, json, sender));
  ipcMain.on(IPCChannel.SCOPE, (_, json: string) => handleScope(options, json));
}

/** Sets up communication channels with the renderer */
export function configureIPC(options: ElectronMainOptionsInternal): void {
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
