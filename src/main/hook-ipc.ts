import { captureEvent, configureScope, Scope } from '@sentry/core';
import { Event } from '@sentry/types';
import { logger } from '@sentry/utils';
import { app, ipcMain, WebContents } from 'electron';

import { AppContext, IPC, normalizeUrl, walk } from '../common';
import { getEventDefaults } from './context';
import { ElectronMainOptions } from './sdk';

/**
 * Handle events from the renderer processes
 */
function handleEvent(jsonEvent: string, contents: WebContents, options?: ElectronMainOptions): void {
  let event: Event;
  try {
    event = JSON.parse(jsonEvent) as Event;
  } catch {
    logger.warn('sentry-electron received an invalid IPC_EVENT message');
    return;
  }

  if (event.exception) {
    event.contexts = {
      electron: {
        crashed_process: options?.getRendererName?.(contents) || `WebContents[${contents.id}]`,
        crashed_url: normalizeUrl(contents.getURL(), app.getAppPath()),
      },
      ...event.contexts,
    };
  }

  captureEvent(event);
}

/** Is object defined and has keys */
function hasKeys(obj: any): boolean {
  return obj != undefined && Object.keys(obj).length > 0;
}

/**
 * Handle scope updates from renderer processes
 */
function handleScope(jsonScope: string, options?: ElectronMainOptions): void {
  let rendererScope: Scope;
  try {
    rendererScope = JSON.parse(jsonScope) as Scope;
  } catch {
    logger.warn('sentry-electron received an invalid IPC_SCOPE message');
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

/**
 * Gets the Electron context and passes it to the renderer
 *
 * This allows the browser SDK to be used in isolation and still include Electron context and normalise paths
 */
async function handleContext(contents: WebContents, options?: ElectronMainOptions): Promise<void> {
  const eventDefaults = await getEventDefaults(options?.release);

  const crashed_process = options?.getRendererName?.(contents) || `WebContents[${contents.id}]`;
  eventDefaults.contexts = {
    ...eventDefaults.contexts,
    electron: { ...eventDefaults.contexts?.electron, crashed_process },
  };

  const context: AppContext = { eventDefaults, appBasePath: app.getAppPath() };
  contents.send(IPC.CONTEXT, JSON.stringify(context, walk));
}

/**
 * Hooks IPC for communication with the renderer processes
 */
export function hookIPC(options: ElectronMainOptions): void {
  ipcMain.on(IPC.EVENT, (event, jsonEvent: string) => handleEvent(jsonEvent, event.sender, options));
  ipcMain.on(IPC.SCOPE, (_, jsonScope: string) => handleScope(jsonScope, options));
  ipcMain.on(IPC.CONTEXT, (event) => handleContext(event.sender, options));
}
