import type { Event, Integration } from '@sentry/core';
import { isAbsolute, relative, resolve } from 'path';

const RENDERER_EVENT_KEY = Symbol('sentry-electron-renderer-event');

/** Marks the event as sent from a renderer process */
export function markRendererEvent(event: Event): void {
  event.sdkProcessingMetadata = { ...event.sdkProcessingMetadata, [RENDERER_EVENT_KEY]: true };
}

/** Was the event sent from a renderer process */
export function isRendererEvent(event: Event): boolean {
  return (event.sdkProcessingMetadata as Record<symbol, unknown> | undefined)?.[RENDERER_EVENT_KEY] === true;
}

function isPathInDirectory(path: string | undefined, directory: string): boolean {
  if (!path || !isAbsolute(path)) {
    return false;
  }

  const rel = relative(resolve(directory), resolve(path));
  return !!rel && !rel.startsWith('..') && !isAbsolute(rel);
}

/**
 * Renderer stack frames can only get main process context lines from files
 * in the app directory, such as preload scripts.
 */
export function limitContextLinesForRendererEvents(integration: Integration, getAppPath: () => string): Integration {
  const processEvent = integration.processEvent?.bind(integration);

  if (integration.name !== 'ContextLines' || !processEvent) {
    return integration;
  }

  return {
    ...integration,
    processEvent: async (event, hint, client) => {
      if (!isRendererEvent(event)) {
        return processEvent(event, hint, client);
      }

      const appPath = getAppPath();
      // ContextLines adds context to the frame objects so the frames in the
      // original event get it too
      const values = (event.exception?.values || []).map((exception) => ({
        ...exception,
        stacktrace: exception.stacktrace && {
          ...exception.stacktrace,
          frames: exception.stacktrace.frames?.filter((frame) => isPathInDirectory(frame.filename, appPath)),
        },
      }));

      await processEvent({ ...event, exception: { values } }, hint, client);

      return event;
    },
  };
}
