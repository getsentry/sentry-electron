import type { Event, Integration } from '@sentry/core';

const RENDERER_EVENT_KEY = '__sentry_electron_renderer_event__';

/** Marks the event as sent from a renderer process */
export function markRendererEvent(event: Event): void {
  event.sdkProcessingMetadata = { ...event.sdkProcessingMetadata, [RENDERER_EVENT_KEY]: true };
}

/** Was the event sent from a renderer process */
export function isRendererEvent(event: Event): boolean {
  return event.sdkProcessingMetadata?.[RENDERER_EVENT_KEY] === true;
}

/**
 * Renderer stack frames are URLs from the renderer, not paths in the main
 * process filesystem, so main process context lines do not apply to them.
 */
export function skipContextLinesForRendererEvents(integration: Integration): Integration {
  const processEvent = integration.processEvent?.bind(integration);

  if (integration.name !== 'ContextLines' || !processEvent) {
    return integration;
  }

  return {
    ...integration,
    processEvent: (event, hint, client) => (isRendererEvent(event) ? event : processEvent(event, hint, client)),
  };
}
