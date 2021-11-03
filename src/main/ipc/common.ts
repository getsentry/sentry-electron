import { captureEvent, configureScope, Scope } from '@sentry/core';
import { Event } from '@sentry/types';
import { logger } from '@sentry/utils';
import { app, WebContents } from 'electron';

import { normalizeUrl } from '../../common';
import { ElectronMainOptions } from '../sdk';

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

  if (event.exception) {
    event.contexts = {
      ...event.contexts,
      electron: contents
        ? {
            crashed_process: options?.getRendererName?.(contents) || `WebContents[${contents.id}]`,
            crashed_url: normalizeUrl(contents.getURL(), app.getAppPath()),
          }
        : { crashed_process: 'renderer' },
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
